// src/pages/ChatsPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCheck,
  MessageSquare,
  Search,
  Send,
} from 'lucide-react';
import type { ChatSesion, EstadoChat, MensajeChat } from '@/types/chat';
import { useNegocio } from '@/context/NegocioContext';
import { useAuth } from '@/context/AuthContext';
import {
  cambiarEstadoChat,
  enviarMensajeAsesor,
  marcarChatLeidoPorAdmin,
  onMensajesChatChange,
  onSesionesChatChange,
} from '@/services/chatService';
import { CHAT_MENSAJE_MAX, validarMensajeChat } from '@/utils/chatValidation';
import { formatHora } from '@/utils/dateUtils';
import { toValidAdminDate } from '@/utils/adminAnalytics';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { createToast } from '@/components/ui/Toast';

const RESPUESTAS_RAPIDAS = [
  '¡Hola! Con gusto te ayudo con tu pedido.',
  'Sí, lo tenemos disponible en este momento.',
  'Tu pedido ya está en preparación.',
  '¿Me confirmas la dirección y el barrio para el domicilio?',
];

const ETIQUETA_ESTADO: Record<EstadoChat, { texto: string; clase: string }> = {
  abierto: { texto: 'Sin atender', clase: 'border-amber-400/40 bg-amber-400/10 text-amber-400' },
  en_atencion: { texto: 'En atención', clase: 'border-blue-400/40 bg-blue-400/10 text-blue-400' },
  cerrado: { texto: 'Cerrado', clase: 'border-neutral-700 bg-neutral-800 text-neutral-400' },
};

function momento(valor: unknown): string {
  const fecha = toValidAdminDate(valor);
  return fecha ? formatHora(fecha) : '--:--';
}

export function ChatsPage() {
  const { negocioActual } = useNegocio();
  const { user } = useAuth();
  const tenantId = negocioActual.id;
  const nombreAsesor = user?.displayName || user?.email?.split('@')[0] || 'Asesor';

  const [sesiones, setSesiones] = useState<ChatSesion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [redaccion, setRedaccion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const finDeLista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCargando(true);
    setSesiones([]);
    setSeleccionId(null);
    return onSesionesChatChange(
      tenantId,
      (datos) => {
        setSesiones(datos);
        setCargando(false);
        setError(null);
      },
      () => {
        setCargando(false);
        setError('No fue posible cargar las conversaciones.');
      }
    );
  }, [tenantId]);

  useEffect(() => {
    if (!seleccionId) {
      setMensajes([]);
      return;
    }
    return onMensajesChatChange(seleccionId, setMensajes, () =>
      setError('No fue posible cargar los mensajes de esta conversación.')
    );
  }, [seleccionId]);

  useEffect(() => {
    finDeLista.current?.scrollIntoView({ block: 'end' });
  }, [mensajes.length]);

  const seleccion = useMemo(
    () => sesiones.find((sesion) => sesion.id === seleccionId) ?? null,
    [sesiones, seleccionId]
  );

  const sesionesFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es-CO');
    if (!termino) return sesiones;
    return sesiones.filter((sesion) =>
      `${sesion.clienteNombre} ${sesion.clienteTelefono ?? ''} ${sesion.ultimoMensaje}`
        .toLocaleLowerCase('es-CO')
        .includes(termino)
    );
  }, [sesiones, busqueda]);

  const totalSinLeer = sesiones.reduce((suma, sesion) => suma + (sesion.noLeidosAdmin || 0), 0);

  const abrirConversacion = (sesion: ChatSesion) => {
    setSeleccionId(sesion.id);
    setRedaccion('');
    if (sesion.noLeidosAdmin > 0) {
      void marcarChatLeidoPorAdmin(sesion.id).catch(() => undefined);
    }
  };

  const handleResponder = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!seleccion) return;

    const errorMensaje = validarMensajeChat(redaccion);
    if (errorMensaje) {
      createToast(errorMensaje, 'error');
      return;
    }

    setEnviando(true);
    const enviado = redaccion;
    setRedaccion('');
    try {
      await enviarMensajeAsesor(seleccion.id, nombreAsesor, enviado);
    } catch {
      setRedaccion(enviado);
      createToast('No se pudo enviar la respuesta', 'error');
    } finally {
      setEnviando(false);
    }
  };

  const handleCerrar = async () => {
    if (!seleccion) return;
    try {
      await cambiarEstadoChat(seleccion.id, 'cerrado');
      createToast('Conversación cerrada', 'success');
    } catch {
      createToast('No se pudo cerrar la conversación', 'error');
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-base-dark px-4 pb-28 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-4">
          <Skeleton className="h-14 w-full rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-dark px-4 pb-28 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="border-b border-neutral-800 pb-4">
          <p className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-400">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Atención al cliente
          </p>
          <h1 className="font-display text-2xl font-black text-white sm:text-3xl">Chats de la tienda</h1>
          <p className="mt-1 text-sm text-neutral-400" aria-live="polite">
            {sesiones.length} conversación{sesiones.length === 1 ? '' : 'es'}
            {totalSinLeer > 0 ? ` · ${totalSinLeer} sin leer` : ''}
          </p>
        </header>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-950/20 p-4">
            <p className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {error}
            </p>
          </div>
        )}

        {sesiones.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Sin conversaciones todavía"
            description="Cuando alguien escriba desde la tienda, su mensaje aparecerá aquí."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <aside aria-label="Conversaciones" className="space-y-2">
              <label className="relative block">
                <span className="sr-only">Buscar conversación</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
                  aria-hidden="true"
                />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o mensaje"
                  className="min-h-11 w-full rounded-xl border border-neutral-800 bg-neutral-900 pl-9 pr-3 text-sm text-white"
                />
              </label>

              <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
                {sesionesFiltradas.map((sesion) => {
                  const activa = sesion.id === seleccionId;
                  const estado = ETIQUETA_ESTADO[sesion.estado] ?? ETIQUETA_ESTADO.abierto;
                  return (
                    <li key={sesion.id}>
                      <button
                        type="button"
                        onClick={() => abrirConversacion(sesion)}
                        aria-pressed={activa}
                        className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                          activa
                            ? 'border-gold-400/50 bg-gold-400/10'
                            : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-bold text-white">
                            {sesion.clienteNombre}
                          </span>
                          <span className="shrink-0 text-[10px] text-neutral-500">
                            {momento(sesion.ultimoMensajeEn)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-neutral-400">
                          {sesion.ultimoMensaje || 'Sin mensajes'}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="outline" className={`px-1.5 py-0.5 text-[10px] ${estado.clase}`}>
                            {estado.texto}
                          </Badge>
                          {sesion.noLeidosAdmin > 0 && (
                            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold-400 px-1 text-[10px] font-bold text-base-dark">
                              {sesion.noLeidosAdmin}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
                {sesionesFiltradas.length === 0 && (
                  <li className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400">
                    Ninguna conversación coincide con «{busqueda}».
                  </li>
                )}
              </ul>
            </aside>

            <section
              aria-label="Conversación seleccionada"
              className="flex min-h-[32rem] flex-col rounded-2xl border border-neutral-800 bg-neutral-900"
            >
              {!seleccion ? (
                <div className="grid flex-1 place-items-center p-6">
                  <p className="text-sm text-neutral-400">
                    Elige una conversación de la lista para responder.
                  </p>
                </div>
              ) : (
                <>
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-base font-black text-white">
                        {seleccion.clienteNombre}
                      </h2>
                      <p className="text-xs text-neutral-400">
                        {seleccion.clienteTelefono || 'Sin teléfono'}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleCerrar()}
                      disabled={seleccion.estado === 'cerrado'}
                      className="text-xs"
                    >
                      <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      {seleccion.estado === 'cerrado' ? 'Cerrada' : 'Cerrar conversación'}
                    </Button>
                  </header>

                  <ul className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
                    {mensajes.map((mensaje) => {
                      const esAsesor = mensaje.autor === 'asesor';
                      return (
                        <li
                          key={mensaje.id}
                          className={`flex flex-col ${esAsesor ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                              esAsesor
                                ? 'bg-gold-400 text-base-dark'
                                : 'bg-neutral-800 text-neutral-100'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{mensaje.texto}</p>
                          </div>
                          <span className="mt-0.5 px-1 text-[10px] text-neutral-500">
                            {mensaje.autorNombre} · {momento(mensaje.creadoEn)}
                          </span>
                        </li>
                      );
                    })}
                    <div ref={finDeLista} />
                  </ul>

                  <div className="flex flex-wrap gap-1.5 border-t border-neutral-800 px-3 py-2">
                    {RESPUESTAS_RAPIDAS.map((respuesta) => (
                      <button
                        key={respuesta}
                        type="button"
                        onClick={() => setRedaccion(respuesta)}
                        className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:border-neutral-700 hover:text-white"
                      >
                        {respuesta}
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={handleResponder}
                    className="flex items-center gap-2 border-t border-neutral-800 px-3 py-2"
                  >
                    <label className="sr-only" htmlFor="respuesta-asesor">Escribe tu respuesta</label>
                    <input
                      id="respuesta-asesor"
                      value={redaccion}
                      onChange={(e) => setRedaccion(e.target.value)}
                      maxLength={CHAT_MENSAJE_MAX}
                      placeholder="Escribe tu respuesta"
                      className="min-h-11 flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-sm text-white"
                    />
                    <Button type="submit" size="sm" loading={enviando} aria-label="Enviar respuesta">
                      <Send className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </form>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
