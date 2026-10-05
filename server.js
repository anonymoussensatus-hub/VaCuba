const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const PUBLIC = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const JSON_DB = path.join(DATA_DIR, "orders.json");
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(JSON_DB)) fs.writeFileSync(JSON_DB, "[]", "utf8");

let pg = null;
let pool = null;
if (DATABASE_URL) {
  try { pg = require("pg"); pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false } }); }
  catch (e) { console.error("No se pudo cargar pg:", e.message); }
}

const sessions = new Map();
const statuses = ["Pendiente de verificación de pago","Pago recibido","En preparación","Enviado","Entregado"];
function send(res, code, data, type="application/json") {
  res.writeHead(code, {"Content-Type": type, "Cache-Control":"no-store", "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"Content-Type,Authorization", "Access-Control-Allow-Methods":"GET,POST,PATCH,OPTIONS"});
  res.end(type === "application/json" ? JSON.stringify(data) : data);
}
function body(req) { return new Promise((resolve,reject)=>{ let raw=""; req.on("data",c=>{raw+=c;if(raw.length>2e6) req.destroy();}); req.on("end",()=>{try{resolve(raw?JSON.parse(raw):{});}catch(e){reject(e);}}); req.on("error",reject); }); }
function hash(v){ return crypto.createHash("sha256").update(v).digest("hex"); }
function auth(req){ const h=req.headers.authorization||""; if(!h.startsWith("Bearer ")) return false; const token=h.slice(7); const exp=sessions.get(token); if(!exp || exp<Date.now()){sessions.delete(token);return false;} return true; }
function newId(){ return "VC-"+crypto.randomBytes(4).toString("hex").toUpperCase(); }
function readJson(){ try{return JSON.parse(fs.readFileSync(JSON_DB,"utf8"));}catch{return [];} }
function writeJson(a){fs.writeFileSync(JSON_DB,JSON.stringify(a,null,2));}
async function initDb(){ if(!pool)return; await pool.query(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY,date TIMESTAMPTZ NOT NULL DEFAULT NOW(),customer JSONB NOT NULL,items JSONB NOT NULL,total NUMERIC(12,2) NOT NULL,payment TEXT NOT NULL,status TEXT NOT NULL,updated_at TIMESTAMPTZ)`); }
async function listOrders(){ if(!pool)return readJson(); const r=await pool.query('SELECT id,date,customer,items,total::float AS total,payment,status,updated_at AS "updatedAt" FROM orders ORDER BY date DESC'); return r.rows; }
async function createOrder(o){ const clean={id:newId(),date:new Date().toISOString(),customer:o.customer,items:o.items,total:Number(o.total)||0,payment:"Zelle — thomasroberthidalgo@gmail.com",status:statuses[0]}; if(!pool){const a=readJson();a.unshift(clean);writeJson(a);return clean;} await pool.query('INSERT INTO orders(id,date,customer,items,total,payment,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[clean.id,clean.date,clean.customer,clean.items,clean.total,clean.payment,clean.status]); return clean; }
async function updateOrder(id,status){ if(!pool){const a=readJson(),o=a.find(x=>x.id===id);if(!o)return null;o.status=status;o.updatedAt=new Date().toISOString();writeJson(a);return o;} const r=await pool.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,date,customer,items,total::float AS total,payment,status,updated_at AS "updatedAt"',[status,id]); return r.rows[0]||null; }
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);
  if(req.method==="OPTIONS")return send(res,204,"");
  try{
    if(url.pathname==="/api/health"&&req.method==="GET") return send(res,200,{ok:true,database:!!pool});
    if(url.pathname==="/api/admin/login"&&req.method==="POST"){
      if(!ADMIN_PASSWORD)return send(res,503,{error:"ADMIN_PASSWORD no configurada"});
      const b=await body(req); if(!b.password || hash(String(b.password))!==hash(ADMIN_PASSWORD))return send(res,401,{error:"Credenciales incorrectas"});
      const token=crypto.randomBytes(32).toString("hex"); sessions.set(token,Date.now()+8*60*60*1000); return send(res,200,{token});
    }
    if(url.pathname==="/api/orders"&&req.method==="POST"){
      const o=await body(req); if(!o.customer?.name||!o.customer?.phone||!o.customer?.province||!o.customer?.municipality||!o.customer?.address||!Array.isArray(o.items)||!o.items.length)return send(res,400,{error:"Datos incompletos"});
      return send(res,201,await createOrder(o));
    }
    if(url.pathname==="/api/orders"&&req.method==="GET"){
      if(!auth(req))return send(res,401,{error:"No autorizado"}); return send(res,200,await listOrders());
    }
    if(url.pathname.startsWith("/api/orders/")&&req.method==="PATCH"){
      if(!auth(req))return send(res,401,{error:"No autorizado"}); const id=decodeURIComponent(url.pathname.split("/").pop()); const b=await body(req);
      if(!statuses.includes(b.status))return send(res,400,{error:"Estado no válido"}); const o=await updateOrder(id,b.status); if(!o)return send(res,404,{error:"Pedido no encontrado"}); return send(res,200,o);
    }
    let file=url.pathname==="/"?"/index.html":url.pathname; file=path.normalize(file).replace(/^(\.\.[/\\])+/,""); const full=path.join(PUBLIC,file); if(!full.startsWith(PUBLIC))return send(res,403,{error:"Forbidden"}); if(!fs.existsSync(full)||fs.statSync(full).isDirectory())return send(res,404,{error:"Not found"});
    const ext=path.extname(full),types={".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".webp":"image/webp"}; res.writeHead(200,{"Content-Type":types[ext]||"application/octet-stream"}); res.end(fs.readFileSync(full));
  }catch(e){console.error(e);send(res,500,{error:"Error interno"});}
});
initDb().then(()=>server.listen(PORT,()=>console.log(`Vacuba listo en puerto ${PORT}${pool?' con PostgreSQL':' con almacenamiento local de respaldo'}`))).catch(e=>{console.error("DB init:",e);process.exit(1)});
