# Phase 8 — Bot de WhatsApp

> **Alcance actualizado (2026-08-25):** el bot no envía enlaces ni solicita credenciales de una
> plataforma de pago. La coordinación del medio offline pertenece al pedido, no al bot.

El bot solo puede enviar mensajes cuando la Function programada tiene enlazado
`WHATSAPP_ACCESS_TOKEN` y están configurados `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_API_VERSION` y `WHATSAPP_NEGOCIO_ID`.

Si la configuración está incompleta o Meta no responde en diez segundos, el envío falla de forma
explícita y la cola conserva el error para reintento. La preparación de Secret Manager y el
despliegue están descritos en `PHASE_7_ENV_SETUP.md`.

## Conversación de pedido

1. `menú` devuelve productos/combos disponibles del tenant configurado.
2. `1`, `1 2` o `1x2` agrega cantidades acotadas a una selección temporal de 30 minutos.
3. `confirmar` solicita uno de dos medios: `efectivo` o `transferencia`.
4. El cliente responde `dirección: Calle... | Barrio`.
5. El backend recalcula el catálogo y crea un `domicilios` con origen `whatsapp`, medio offline y
   código `LP-WA-*`. No crea una venta anticipada ni confirma un pago recibido.

El bot solo procesa la cola cuando `configuracion/{negocioId}.activo` es `true`. Usa mensajes
personalizados solo si cumplen límites y no contienen enlaces de cobro, y deja el resto para
respuesta manual. El panel también envía por backend; escribir un documento en
Firestore ya no simula un envío.

## Reintentos y auditoría

- Estados de cola: `pendiente` → `procesando` → `procesado`; una falla pasa a `error` y termina en
  `descartado` al tercer intento.
- Un lease vencido vuelve a `pendiente`; la respuesta calculada se reutiliza para no duplicar items
  o confirmaciones tras una falla del proveedor.
- Toda salida exitosa exige `referenciaWhatsapp`. Los estados de entrega solo los actualiza el
  webhook firmado.
- La UI conserva hasta 200 mensajes recientes por negocio y separa de ellos la bandeja sin leer.
- La selección guarda IDs estables del catálogo. Cada transición de orden y la respuesta de su
  `queueId` se escriben juntas; un reintento concurrente devuelve el resultado anterior sin sumar
  cantidades ni crear otro domicilio.

La suite local usa un proveedor falso y emuladores; no demuestra conectividad ni aprobación de
plantillas/número en Meta. El PASO-07 permanece abierto hasta completar el gate sandbox real.
