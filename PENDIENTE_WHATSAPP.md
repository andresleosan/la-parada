# Pendiente: activar WhatsApp

**Estado:** en pausa por decisión de producto. El código está listo y desplegable; falta
únicamente la cuenta de WhatsApp Business y sus credenciales.

**Cómo retomarlo:** avisa que ya tienes WhatsApp y se ejecuta la secuencia de abajo.

---

## Por qué está en pausa

Las tres credenciales de WhatsApp Business Cloud API se declaran con `defineSecret` en
[integrationParams.ts](firebase-functions/src/config/integrationParams.ts) y no existen en
Google Cloud Secret Manager. El CLI de Firebase valida los secretos de **todo** el codebase
antes de aplicar `--only`, así que mientras falten, cualquier `firebase deploy --only functions`
se queda pidiéndolos por consola aunque se filtre a una sola función.

## Estado real verificado (2026-09-06)

Proyecto `laparada-26`. `firebase functions:list` devuelve **una sola** función desplegada:

| Función | Desplegada | Secretos que necesita |
| --- | --- | --- |
| `removerFondoProducto` | Sí | `REMOVE_BG_API_KEY` (ya existe) |
| `crearPedidoPublico` | No | ninguno |
| `crearUsuarioPersonal` | No | ninguno |
| `enviarMensajeWhatsAppManual` | No | los tres de WhatsApp |
| `whatsappWebhook` | No | los tres de WhatsApp |
| `procesarMensajesBot` | No | los tres de WhatsApp |
| `limpiarOrdenesExpiradas` | No | los tres de WhatsApp |
| `reintenrarMensajesEnError` | No | los tres de WhatsApp |

Consecuencia a tener presente: **el checkout de la tienda web no funciona** porque
`crearPedidoPublico` nunca se desplegó. El frontend lo llama desde
[publicOrderService.ts](src/services/publicOrderService.ts) y no encuentra nada del otro lado.
Eso es independiente de WhatsApp y se puede resolver antes.

## Secuencia cuando llegue la cuenta

1. **Obtener de Meta Business** (developers.facebook.com → tu app → WhatsApp):
   - token de acceso permanente del sistema (`EAA…`, ~200 caracteres),
   - *App Secret* de la app,
   - un *verify token* inventado por ti para el webhook (cadena aleatoria larga),
   - el `Phone Number ID` del número de prueba o productivo.

2. **Crear los secretos** (uno por comando, pide el valor por consola):
   ```
   firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
   firebase functions:secrets:set WHATSAPP_APP_SECRET
   firebase functions:secrets:set WHATSAPP_WEBHOOK_VERIFY_TOKEN
   ```

3. **Configurar los parámetros no secretos** en `firebase-functions/.env`
   (plantilla en `.env.example`): `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION` y
   `WHATSAPP_NEGOCIO_ID=laparada`.

4. **Desplegar**:
   ```
   firebase deploy --only functions
   ```

5. **Registrar el webhook** en Meta apuntando a la URL de `whatsappWebhook`, usando el mismo
   verify token del paso 2. La guía de comportamiento del bot está en
   [PHASE_8_BOT_GUIDE.md](PHASE_8_BOT_GUIDE.md).

6. **Activar el bot** desde el panel: *Configuración del bot* escribe
   `configuracion/{negocioId}.activo`. Mientras sea `false`, las funciones quedan desplegadas
   pero inertes.

## Restricciones que siguen vigentes

- Los mensajes del bot no pueden contener enlaces de cobro en línea; hay una validación que los
  rechaza en [botConfigService.ts](src/services/botConfigService.ts) y en el backend.
- El bot ya no filtra por franja del día: se eliminó la lógica de jornadas en el commit `5950fc7`.
- Confirmar costos y autorización antes de habilitar APIs nuevas o desplegar (ver `MEJORAS.md`).

## Alternativa si quieres el checkout ya, sin WhatsApp

Crear los tres secretos con valores desechables solo para satisfacer al CLI y desplegar
únicamente lo que no depende de ellos:

```
firebase deploy --only functions:crearPedidoPublico
```

Las funciones de WhatsApp quedan sin desplegar y los secretos desechables inertes en Secret
Manager. Al llegar las credenciales reales se sobrescriben con `functions:secrets:set` y se
despliega el resto.
