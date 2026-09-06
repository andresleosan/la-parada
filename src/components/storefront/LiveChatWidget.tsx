// src/components/storefront/LiveChatWidget.tsx
import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ChatSesion, MensajeChat } from '@/types/chat';
import { DEFAULT_NEGOCIO_ID } from '@/types/negocio';
import {
  abrirSesionChat,
  asegurarVisitanteChat,
  enviarMensajeCliente,
  marcarChatLeidoPorCliente,
  momentoUltimoMensaje,
  onMensajesChatChange,
  onSesionChatChange,
} from '@/services/chatService';
import {
  CHAT_MENSAJE_MAX,
  CHAT_NOMBRE_MAX,
  CHAT_TELEFONO_MAX,
  esperaRestanteChat,
  validarMensajeChat,
  validarNombreChat,
  validarTelefonoChat,
} from '@/utils/chatValidation';
import { formatHora } from '@/utils/dateUtils';
import { toValidAdminDate } from '@/utils/adminAnalytics';

const PERFIL_GUARDADO = 'laparada_chat_perfil';

interface PerfilGuardado {
  nombre: string;
  telefono: string;
}

/** Solo se recuerdan los datos de contacto; los mensajes viven en Firestore. */
function leerPerfilGuardado(): PerfilGuardado {
  try {
    const crudo = localStorage.getItem(PERFIL_GUARDADO);
    if (!crudo) return { nombre: '', telefono: '' };
    const datos = JSON.parse(crudo) as Partial<PerfilGuardado>;
    return {
      nombre: typeof datos.nombre === 'string' ? datos.nombre : '',
      telefono: typeof datos.telefono === 'string' ? datos.telefono : '',
    };
  } catch {
    return { nombre: '', telefono: '' };
  }
}

function guardarPerfil(perfil: PerfilGuardado): void {
  try {
    localStorage.setItem(PERFIL_GUARDADO, JSON.stringify(perfil));
  } catch {
    /* modo privado o almacenamiento bloqueado: el chat funciona igual */
  }
}

function horaMensaje(mensaje: MensajeChat): string {
  const fecha = toValidAdminDate(mensaje.creadoEn);
  // Un mensaje recién enviado aún no tiene el timestamp del servidor.
  return fecha ? formatHora(fecha) : 'Enviando…';
}

export function LiveChatWidget() {
  const [abierto, setAbierto] = useState(false);
  const [visitante, setVisitante] = useState<User | null>(null);
  const [sesion, setSesion] = useState<ChatSesion | null>(null);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [perfil, setPerfil] = useState<PerfilGuardado>(() => ({ nombre: '', telefono: '' }));
  const [consulta, setConsulta] = useState('');
  const [redaccion, setRedaccion] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const finDeLista = useRef<HTMLDivElement>(null);

  const sesionIniciada = Boolean(sesion);

  useEffect(() => {
    setPerfil(leerPerfilGuardado());
  }, []);

  // La identidad solo se pide al abrir el panel: quien nunca use el chat no
  // genera una cuenta anónima ni una lectura de más.
  useEffect(() => {
    if (!abierto || visitante) return;
    let cancelado = false;
    asegurarVisitanteChat()
      .then((user) => {
        if (!cancelado) setVisitante(user);
      })
      .catch((err: Error) => {
        if (!cancelado) setError(err.message);
      });
    return () => {
      cancelado = true;
    };
  }, [abierto, visitante]);

  useEffect(() => {
    if (!visitante) return;
    return onSesionChatChange(visitante.uid, setSesion);
  }, [visitante]);

  useEffect(() => {
    if (!visitante || !sesionIniciada) return;
    return onMensajesChatChange(
      visitante.uid,
      setMensajes,
      () => setError('No pudimos cargar la conversación')
    );
  }, [visitante, sesionIniciada]);

  useEffect(() => {
    if (abierto) finDeLista.current?.scrollIntoView({ block: 'end' });
  }, [abierto, mensajes.length]);

  // Abrir el panel da por vistas las respuestas del negocio.
  useEffect(() => {
    if (!abierto || !visitante || !sesion || sesion.noLeidosCliente === 0) return;
    void marcarChatLeidoPorCliente(visitante.uid).catch(() => undefined);
  }, [abierto, visitante, sesion]);

  const sinLeer = !abierto && (sesion?.noLeidosCliente ?? 0) > 0;

  const handleIniciar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!visitante) return;

    const errorNombre = validarNombreChat(perfil.nombre);
    const errorTelefono = validarTelefonoChat(perfil.telefono);
    const errorConsulta = validarMensajeChat(consulta);
    const primerError = errorNombre || errorTelefono || errorConsulta;
    if (primerError) {
      setError(primerError);
      return;
    }

    setEnviando(true);
    setError('');
    try {
      await abrirSesionChat(DEFAULT_NEGOCIO_ID, visitante.uid, perfil.nombre, perfil.telefono);
      await enviarMensajeCliente(visitante.uid, perfil.nombre, consulta);
      guardarPerfil(perfil);
      setConsulta('');
    } catch {
      setError('No pudimos abrir la conversación. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!visitante || !sesion) return;

    const errorMensaje = validarMensajeChat(redaccion);
    if (errorMensaje) {
      setError(errorMensaje);
      return;
    }

    const espera = esperaRestanteChat(momentoUltimoMensaje(sesion), Date.now());
    if (espera > 0) {
      setError('Espera un momento antes de enviar otro mensaje');
      return;
    }

    setEnviando(true);
    setError('');
    const enviado = redaccion;
    setRedaccion('');
    try {
      await enviarMensajeCliente(visitante.uid, sesion.clienteNombre, enviado, sesion.estado);
    } catch {
      setRedaccion(enviado);
      setError('No se pudo enviar el mensaje');
    } finally {
      setEnviando(false);
    }
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={sinLeer ? 'Abrir chat: tienes respuestas sin leer' : 'Abrir chat con La Parada'}
        className="fixed bottom-24 right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-amber-500 px-4 font-bold text-neutral-950 shadow-2xl shadow-amber-500/30 transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6"
      >
        <MessageSquare className="h-5 w-5" aria-hidden="true" />
        <span className="hidden text-sm sm:inline">Escríbenos</span>
        {sinLeer && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neutral-950 px-1 text-[11px] text-amber-400">
            {sesion?.noLeidosCliente}
          </span>
        )}
      </button>
    );
  }

  return (
    <section
      aria-label="Chat con La Parada"
      className="fixed bottom-24 right-4 z-40 flex h-[min(540px,calc(100vh-8rem))] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl md:bottom-6 md:right-6"
    >
      <header className="flex items-start justify-between gap-3 bg-neutral-950 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-black text-white">Atención La Parada</h2>
          <p className="truncate text-xs text-neutral-400">
            Pregunta por el menú, precios o tu pedido
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          aria-label="Cerrar chat"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!sesionIniciada ? (
          <form onSubmit={handleIniciar} className="space-y-3" aria-label="Iniciar conversación">
            <p className="text-xs leading-relaxed text-neutral-400">
              Déjanos tus datos y tu consulta. Te respondemos por aquí mismo.
            </p>
            <label className="block text-xs font-semibold text-neutral-300">
              Nombre
              <input
                value={perfil.nombre}
                onChange={(e) => setPerfil((actual) => ({ ...actual, nombre: e.target.value }))}
                maxLength={CHAT_NOMBRE_MAX}
                required
                className="mt-1 min-h-11 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-sm text-white"
              />
            </label>
            <label className="block text-xs font-semibold text-neutral-300">
              Teléfono <span className="font-normal text-neutral-500">(opcional)</span>
              <input
                value={perfil.telefono}
                onChange={(e) => setPerfil((actual) => ({ ...actual, telefono: e.target.value }))}
                maxLength={CHAT_TELEFONO_MAX}
                inputMode="tel"
                className="mt-1 min-h-11 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-sm text-white"
              />
            </label>
            <label className="block text-xs font-semibold text-neutral-300">
              Tu consulta
              <textarea
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                maxLength={CHAT_MENSAJE_MAX}
                rows={3}
                required
                className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <button
              type="submit"
              disabled={enviando || !visitante}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-bold text-neutral-950 disabled:opacity-60"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Iniciar conversación
            </button>
          </form>
        ) : (
          <ul className="space-y-2.5">
            {mensajes.map((mensaje) => {
              const esCliente = mensaje.autor === 'cliente';
              return (
                <li
                  key={mensaje.id}
                  className={`flex flex-col ${esCliente ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      esCliente
                        ? 'bg-amber-500 text-neutral-950'
                        : 'bg-neutral-800 text-neutral-100'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{mensaje.texto}</p>
                  </div>
                  <span className="mt-0.5 px-1 text-[10px] text-neutral-500">
                    {esCliente ? 'Tú' : mensaje.autorNombre} · {horaMensaje(mensaje)}
                  </span>
                </li>
              );
            })}
            <div ref={finDeLista} />
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className="border-t border-neutral-800 px-4 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {sesionIniciada && (
        <form
          onSubmit={handleEnviar}
          className="flex items-center gap-2 border-t border-neutral-800 px-3 py-2"
        >
          <label className="sr-only" htmlFor="chat-redaccion">Escribe tu mensaje</label>
          <input
            id="chat-redaccion"
            value={redaccion}
            onChange={(e) => setRedaccion(e.target.value)}
            maxLength={CHAT_MENSAJE_MAX}
            placeholder="Escribe tu mensaje"
            className="min-h-11 flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-sm text-white"
          />
          <button
            type="submit"
            disabled={enviando}
            aria-label="Enviar mensaje"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500 text-neutral-950 disabled:opacity-60"
          >
            {enviando
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Send className="h-4 w-4" aria-hidden="true" />}
          </button>
        </form>
      )}
    </section>
  );
}
