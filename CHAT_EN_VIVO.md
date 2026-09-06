# Chat en vivo de la tienda

Conversación directa entre un visitante de la tienda web y una persona del negocio.
**No es un bot**: nadie responde solo, alguien tiene que abrir la bandeja y contestar.

## Cómo funciona

- **Visitante**: burbuja flotante en la tienda ([LiveChatWidget.tsx](src/components/storefront/LiveChatWidget.tsx)).
  Pide nombre, teléfono opcional y la consulta; a partir de ahí es un hilo de mensajes en vivo.
- **Negocio**: bandeja en `/chats` ([ChatsPage.tsx](src/pages/ChatsPage.tsx)), con lista de
  conversaciones, buscador, contador de no leídos, respuestas rápidas y cierre de conversación.

Ambos lados usan `onSnapshot`, así que los mensajes llegan en tiempo real sin recargar.

## Por qué no hay backend

La Parada es un SPA de Vite sobre Firebase Hosting: no hay servidor propio donde validar. Y las
Cloud Functions no se pueden desplegar hasta resolver los secretos de WhatsApp
(ver [PENDIENTE_WHATSAPP.md](PENDIENTE_WHATSAPP.md)).

Así que el contrato se hace cumplir en `firestore.rules`, que es el único punto por el que pasa
toda escritura. Lo que allí se valida:

| Regla | Qué impide |
| --- | --- |
| `chatId == request.auth.uid` | Abrir o leer la conversación de otra persona |
| `texto` entre 1 y 1200 caracteres | Mensajes vacíos o gigantes |
| `clienteNombre` entre 2 y 80 | Hilos sin identificar |
| Intervalo mínimo de 2 s entre mensajes | Spam desde el navegador |
| `noLeidosAdmin <= actual + 1` | Inflar el contador de la bandeja |
| `negocioId`, `clienteUid` y `creadoEn` inmutables | Mover un hilo a otro negocio |
| `autor == 'cliente'` para el visitante | Hacerse pasar por un asesor |
| Mensajes sin `update` | Reescribir lo ya dicho |

El intervalo mínimo se exime cuando el hilo aún no tiene mensajes, porque la sesión y el primer
mensaje se escriben casi en el mismo instante.

## Identidad del visitante

Multiogar firma una cookie propia desde su servidor. Aquí no hay servidor, así que el hilo se
ancla al **uid de Firebase**: si la persona ya entró con su cuenta se reutiliza ese uid y, si no,
se abre una sesión anónima al abrir el panel del chat (no antes, para no crear cuentas de quien
nunca lo usa).

> **Requiere habilitar el acceso anónimo** en Firebase Console → Authentication → Sign-in method →
> Anonymous. Sin eso, el widget muestra el error correspondiente y no deja escribir.

La landing distingue esa sesión anónima de una cuenta real (`user.isAnonymous`), para que el
encabezado no muestre a un visitante anónimo como si hubiera iniciado sesión.

## Modelo de datos

```
chats/{chatId}                     chatId == uid del visitante
  negocioId, clienteUid, clienteNombre, clienteTelefono?
  estado: 'abierto' | 'en_atencion' | 'cerrado'
  ultimoMensaje, ultimoMensajeEn        resumen para pintar la bandeja
  noLeidosAdmin, noLeidosCliente
  creadoEn, actualizadoEn

chats/{chatId}/mensajes/{mensajeId}
  autor: 'cliente' | 'asesor'
  autorNombre, texto, creadoEn
```

Cada envío escribe el mensaje y actualiza el resumen de la sesión **en un solo lote**, para que la
bandeja nunca muestre un último mensaje que no existe.

## Qué falta

- **Adjuntar imágenes.** Multiogar las normaliza con `sharp` en el servidor antes de guardarlas;
  sin Functions no hay dónde hacer eso, y subir originales sin procesar desde el navegador es un
  riesgo de abuso. Queda para cuando se puedan desplegar Functions.
- **Aviso al negocio.** Hoy hay que tener `/chats` abierto para enterarse. Una notificación
  (push, correo o el propio WhatsApp) necesita backend.
- **Historial largo.** Se traen los últimos 100 mensajes por hilo y las 100 conversaciones más
  recientes; sin paginación más allá de eso.

## Antes de usarlo en producción

1. Habilitar **Anonymous** en Firebase Authentication.
2. Desplegar reglas e índice:
   ```
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   Las reglas **no se han podido probar localmente**: el emulador de Firestore necesita Java y no
   está instalado en este equipo. El despliegue las valida del lado del servidor antes de
   aplicarlas, así que un error de sintaxis se detecta ahí.
3. Desplegar la tienda con `firebase deploy --only hosting`.
