# Vacuba — tienda web

## Versión 2.0
- Catálogo, filtros, carrito y checkout.
- Pedidos persistentes.
- PostgreSQL cuando `DATABASE_URL` está configurada; `orders.json` queda como respaldo local.
- Panel de administración con contraseña y token de sesión de 8 horas.
- Municipios de las provincias y del municipio especial Isla de la Juventud.
- Zelle mostrado como método de pago: `thomasroberthidalgo@gmail.com`.

## Ejecutar localmente
1. Instala Node.js 18+.
2. `npm install`
3. Copia `.env.example` a `.env` y configura `ADMIN_PASSWORD`.
4. Para PostgreSQL, configura `DATABASE_URL`.
5. `npm start` y abre `http://localhost:3000`.

## Producción
Usa HTTPS, una contraseña larga, PostgreSQL administrado y variables de entorno del proveedor. No subas `.env` al repositorio. Zelle no se verifica automáticamente con este proyecto: el estado inicial es “Pendiente de verificación de pago” y el administrador lo cambia después de comprobar el pago.
