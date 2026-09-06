# Gate externo — App Check para el checkout público

Estado: **configurado en producción el 2026-08-28; smoke funcional pendiente de cierre**.
Proyecto: `laparada-26`.  
Frontend observado: `https://laparada.pages.dev`.

La Function `crearPedidoPublico` rechaza solicitudes sin App Check válido y consume tokens de uso
limitado para reducir replay. El frontend falla de forma cerrada si no recibe
`VITE_FIREBASE_APP_CHECK_SITE_KEY`.

## Configuración de producción

Completada el 2026-08-28: API habilitada, clave web `score` restringida a
`laparada.pages.dev`, app Firebase registrada con TTL de una hora y umbral 0,5, y
`VITE_FIREBASE_APP_CHECK_SITE_KEY` almacenada cifrada en Cloudflare Pages. La cuenta de servicio
de Functions 2nd gen tiene el rol `Firebase App Check Token Verifier`. El valor de la clave de
remove.bg permanece únicamente en Secret Manager.

## Checklist de configuración

1. En Google Cloud, crear una clave web **score-based** de reCAPTCHA Enterprise para los dominios
   reales. No incluir `localhost` en la clave de producción.
2. En Firebase Console > App Check, registrar la app web con esa clave.
3. Agregar la clave pública al entorno de build de Cloudflare Pages como
   `VITE_FIREBASE_APP_CHECK_SITE_KEY`. No guardar tokens debug en Git ni en variables públicas.
4. Para replay protection, verificar que la cuenta de servicio de Functions 2nd gen tenga el rol
   `Firebase App Check Token Verifier`.
5. Publicar primero una preview, revisar métricas de App Check y ejecutar el smoke completo del
   pedido. Habilitar enforcement de otros productos Firebase solo después de medir el impacto; la
   callable ya lo exige en código.
6. Configurar TTL sobre `_limites_pedidos_publicos.expiraEn` si se acepta el costo de borrados. El
   endpoint funciona sin TTL, pero los buckets de rate limit se acumularían.

## Smoke obligatorio

- Un pedido válido crea exactamente un `domicilio` y devuelve código `LP-*` con total de servidor.
- Repetir el mismo envío devuelve el mismo código y no duplica el documento.
- Cambiar precio/total desde DevTools no altera el total; esos campos ni siquiera son aceptados.
- Un producto deshabilitado o de otro tenant se rechaza.
- Una solicitud sin App Check y una escritura directa a Firestore se rechazan.
- Efectivo y transferencia manual funcionan; no aparece ningún proveedor o enlace de pago.

## Repetición local sin servicios externos

Usar siempre un proyecto `demo-*`. Functions necesita valores ficticios en los archivos ignorados
`firebase-functions/.env.local` y `firebase-functions/.secret.local` para cargar también los módulos de WhatsApp; no
usar credenciales reales. En terminales separadas:

```powershell
corepack pnpm firebase emulators:start --only firestore,functions --project demo-la-parada-e2e

$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:GCLOUD_PROJECT='demo-la-parada-e2e'
corepack pnpm seed:e2e

$env:VITE_FIREBASE_PROJECT_ID='demo-la-parada-e2e'
$env:VITE_USE_FIREBASE_EMULATORS='true'
corepack pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort

$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:GCLOUD_PROJECT='demo-la-parada-e2e'
corepack pnpm verify:e2e
```

El 2026-08-25 este recorrido produjo `LP-BPZTNAIX`; el emulador registró App Check como `VALID` y
la verificación confirmó un solo pedido de $18.000 recalculado desde catálogo.

## Reversión

No habilitar ni desplegar sin autorización explícita. Si la preview bloquea tráfico legítimo,
revertir frontend/Function a la revisión anterior y revisar métricas; no reabrir
`allow create: if true` en `domicilios`.

Fuentes oficiales consultadas el 2026-08-25:

- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://firebase.google.com/docs/app-check/cloud-functions
- https://firebase.google.com/docs/functions/callable
