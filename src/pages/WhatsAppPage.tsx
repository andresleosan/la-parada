// src/pages/WhatsAppPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  obtenerMensajesRecientes,
  obtenerHistorialMensajes,
  enviarMensajeWhatsApp,
  marcarMensajeLeido,
  onNuevosMensajes,
} from '@/services/whatsappService';
import { getDomiciliosActivos, updateDomicilioEstado } from '@/services/domiciliosService';
import { MensajeWhatsApp, Domicilio, EstadoDomicilio } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { createToast } from '@/components/ui/Toast';
import { formatCOP } from '@/utils/formatCOP';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  CreditCard,
  Globe,
  Inbox,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Send,
  ShoppingBag,
  Truck,
  Utensils,
} from 'lucide-react';
import { useNegocio } from '@/context/NegocioContext';

function formatFechaMensaje(fecha?: Timestamp | Date | null): string {
  if (!fecha) return 'N/A';
  if (fecha instanceof Date) return fecha.toLocaleString();
  if (typeof (fecha as any).toDate === 'function') {
    return (fecha as any).toDate().toLocaleString();
  }
  return 'N/A';
}

function formatHoraMensaje(fecha?: Timestamp | Date | null): string {
  if (!fecha) return 'N/A';
  if (fecha instanceof Date) return fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (typeof (fecha as any).toDate === 'function') {
    return (fecha as any).toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return 'N/A';
}

export function WhatsAppPage() {
  const { negocioActual } = useNegocio();
  const tenantId = negocioActual.id;
  const [tab, setTab] = useState<'pedidos' | 'inbox' | 'historial'>('pedidos');
  
  // Estado de Pedidos Activos
  const [pedidos, setPedidos] = useState<Domicilio[]>([]);
  const [loadingPedidos, setLoadingPedidos] = useState(true);
  const [pedidosError, setPedidosError] = useState<string | null>(null);
  const [filtroCanal, setFiltroCanal] = useState<'todos' | 'web' | 'whatsapp'>('todos');

  // Estado de Mensajes WhatsApp
  const [mensajes, setMensajes] = useState<MensajeWhatsApp[]>([]);
  const [loadingMensajes, setLoadingMensajes] = useState(true);
  const [mensajesError, setMensajesError] = useState<string | null>(null);
  const [telefonoSeleccionado, setTelefonoSeleccionado] = useState('');
  const [conversacion, setConversacion] = useState<MensajeWhatsApp[]>([]);
  const [loadingConversacion, setLoadingConversacion] = useState(false);
  const [conversacionError, setConversacionError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Form para enviar mensaje
  const [telefonoEnvio, setTelefonoEnvio] = useState('');
  const [contenidoEnvio, setContenidoEnvio] = useState('');
  const intentoEnvio = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const pedidosGenerationRef = useRef(0);
  const mensajesGenerationRef = useRef(0);
  const conversacionGenerationRef = useRef(0);
  const activeTenantRef = useRef(tenantId);
  activeTenantRef.current = tenantId;

  const cargarPedidos = async () => {
    const scopeTenantId = tenantId;
    const generation = ++pedidosGenerationRef.current;
    setLoadingPedidos(true);
    setPedidosError(null);
    try {
      const data = await getDomiciliosActivos(scopeTenantId);
      if (generation !== pedidosGenerationRef.current) return;
      setPedidos(data);
    } catch (err) {
      if (generation !== pedidosGenerationRef.current) return;
      console.error('Error cargando pedidos:', err);
      setPedidosError('No fue posible consultar los pedidos activos.');
    } finally {
      if (generation === pedidosGenerationRef.current) setLoadingPedidos(false);
    }
  };

  const cargarMensajes = async () => {
    const scopeTenantId = tenantId;
    const generation = ++mensajesGenerationRef.current;
    setLoadingMensajes(true);
    setMensajesError(null);
    try {
      const datos = await obtenerMensajesRecientes(scopeTenantId);
      if (generation !== mensajesGenerationRef.current) return;
      setMensajes(datos);
    } catch (err) {
      if (generation !== mensajesGenerationRef.current) return;
      console.error('Error cargando mensajes:', err);
      setMensajesError('No fue posible consultar la mensajería.');
    } finally {
      if (generation === mensajesGenerationRef.current) setLoadingMensajes(false);
    }
  };

  useEffect(() => {
    cargarPedidos();
    cargarMensajes();

    // Listener para nuevos mensajes
    const unsubscribe = onNuevosMensajes(
      tenantId,
      (nuevoMensaje) => {
        if (activeTenantRef.current !== tenantId) return;
        setMensajes((prev) => prev.some((mensaje) => mensaje.id === nuevoMensaje.id)
          ? prev
          : [nuevoMensaje, ...prev]);
      },
      (error) => {
        if (activeTenantRef.current !== tenantId) return;
        console.error('Error en listener de mensajes:', error);
        setMensajesError('Se perdió la actualización en tiempo real de la mensajería.');
      }
    );

    return () => {
      pedidosGenerationRef.current += 1;
      mensajesGenerationRef.current += 1;
      conversacionGenerationRef.current += 1;
      unsubscribe();
    };
  }, [tenantId]);

  const handleCambiarEstadoPedido = async (pedidoId: string, nuevoEstado: EstadoDomicilio) => {
    try {
      await updateDomicilioEstado(pedidoId, nuevoEstado, tenantId);
      createToast(`Pedido actualizado a ${nuevoEstado}`, 'success');
      await cargarPedidos();
    } catch (err) {
      console.error('Error al actualizar pedido:', err);
      createToast('Error al actualizar estado', 'error');
    }
  };

  const handleSeleccionarConversacion = async (telefono: string) => {
    const scopeTenantId = tenantId;
    const generation = ++conversacionGenerationRef.current;
    setTelefonoSeleccionado(telefono);
    setTelefonoEnvio(telefono);
    setLoadingConversacion(true);
    setConversacionError(null);
    try {
      const historial = await obtenerHistorialMensajes(scopeTenantId, telefono);
      if (generation !== conversacionGenerationRef.current) return;
      setConversacion([...historial].reverse());
    } catch (error) {
      if (generation !== conversacionGenerationRef.current) return;
      console.error('Error cargando conversación:', error);
      setConversacionError('No fue posible consultar esta conversación.');
    } finally {
      if (generation === conversacionGenerationRef.current) setLoadingConversacion(false);
    }
  };

  const handleMarcarLeido = async (mensajeId: string) => {
    try {
      await marcarMensajeLeido(mensajeId, tenantId);
      setMensajes((prev) => prev.map((mensaje) =>
        mensaje.id === mensajeId ? { ...mensaje, estado: 'leido' } : mensaje
      ));
      createToast('Marcado como leído', 'success');
    } catch {
      createToast('Error al marcar leído', 'error');
    }
  };

  const handleEnviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telefonoEnvio.trim() || !contenidoEnvio.trim()) {
      createToast('Completa todos los campos', 'error');
      return;
    }

    try {
      setEnviando(true);
      const fingerprint = `${tenantId}\u0000${telefonoEnvio.trim()}\u0000${contenidoEnvio.trim()}`;
      if (intentoEnvio.current?.fingerprint !== fingerprint) {
        intentoEnvio.current = { fingerprint, idempotencyKey: crypto.randomUUID() };
      }
      await enviarMensajeWhatsApp(tenantId, {
        telefono: telefonoEnvio,
        contenido: contenidoEnvio,
        idempotencyKey: intentoEnvio.current.idempotencyKey,
      });
      intentoEnvio.current = null;
      createToast('Mensaje enviado', 'success');
      setTelefonoEnvio('');
      setContenidoEnvio('');
      await cargarMensajes();
      if (telefonoSeleccionado) {
        await handleSeleccionarConversacion(telefonoSeleccionado);
      }
    } catch {
      createToast('Error al enviar mensaje', 'error');
    } finally {
      setEnviando(false);
    }
  };

  const telefonosUnicos = Array.from(new Set(mensajes.map((m) => m.telefono)));
  const mensajesSinLeer = mensajes.filter(
    (mensaje) => mensaje.tipo === 'entrada' && mensaje.estado === 'entregado'
  );

  const pedidosFiltrados = pedidos.filter((p) => {
    if (filtroCanal === 'todos') return true;
    return p.origen === filtroCanal;
  });

  return (
    <div className="min-h-screen bg-base-dark pb-28 pt-6 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">
              Gestión de Pedidos & Mensajería
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-neutral-400">
              Control unificado de órdenes desde la Tienda Virtual y WhatsApp Bot
            </p>
          </div>

          {/* Selector de Pestañas */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab('pedidos')}
              aria-pressed={tab === 'pedidos'}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 ${
                tab === 'pedidos'
                  ? 'bg-gold-400/20 text-gold-400 border border-gold-400/40 shadow-sm'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <ShoppingBag size={14} />
              Pedidos Entrantes ({pedidos.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('inbox')}
              aria-pressed={tab === 'inbox'}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 ${
                tab === 'inbox'
                  ? 'bg-gold-400/20 text-gold-400 border border-gold-400/40 shadow-sm'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <Inbox size={14} />
              Sin Leer ({mensajesSinLeer.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('historial')}
              aria-pressed={tab === 'historial'}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 ${
                tab === 'historial'
                  ? 'bg-gold-400/20 text-gold-400 border border-gold-400/40 shadow-sm'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <Clock size={14} />
              Chat WhatsApp
            </button>
          </div>
        </div>

        {/* CONTENIDO 1: PEDIDOS ENTRANTES */}
        {tab === 'pedidos' && (
          <div className="space-y-4">
            {/* Filtros de origen */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="no-scrollbar flex w-full gap-2 overflow-x-auto sm:w-auto" role="group" aria-label="Filtrar pedidos por canal">
                <Button
                  size="sm"
                  variant={filtroCanal === 'todos' ? 'primary' : 'secondary'}
                  onClick={() => setFiltroCanal('todos')}
                  aria-pressed={filtroCanal === 'todos'}
                  className="text-xs"
                >
                  Todos ({pedidos.length})
                </Button>
                <Button
                  size="sm"
                  variant={filtroCanal === 'web' ? 'primary' : 'secondary'}
                  onClick={() => setFiltroCanal('web')}
                  aria-pressed={filtroCanal === 'web'}
                  className="text-xs flex items-center gap-1"
                >
                  <Globe size={13} />
                  Tienda Web ({pedidos.filter((p) => p.origen === 'web').length})
                </Button>
                <Button
                  size="sm"
                  variant={filtroCanal === 'whatsapp' ? 'primary' : 'secondary'}
                  onClick={() => setFiltroCanal('whatsapp')}
                  aria-pressed={filtroCanal === 'whatsapp'}
                  className="text-xs flex items-center gap-1"
                >
                  <MessageCircle size={13} />
                  WhatsApp ({pedidos.filter((p) => p.origen === 'whatsapp').length})
                </Button>
              </div>

              <Button size="sm" variant="secondary" onClick={cargarPedidos} className="flex w-full items-center gap-1 text-xs sm:w-auto">
                <RefreshCw size={13} />
                Actualizar
              </Button>
            </div>

            {pedidosError && !loadingPedidos ? (
              <EmptyState
                icon={AlertCircle}
                title="No pudimos cargar los pedidos"
                description="No mostramos una bandeja vacía porque la consulta falló."
                action={{ label: 'Reintentar', onClick: cargarPedidos }}
              />
            ) : loadingPedidos ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 w-full rounded-xl" />
                ))}
              </div>
            ) : pedidosFiltrados.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="No hay pedidos activos"
                description="Los nuevos pedidos desde la Tienda Virtual o WhatsApp aparecerán aquí automáticamente."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {pedidosFiltrados.map((pedido) => (
                  <Card
                    key={pedido.id}
                    className="p-4 bg-neutral-900/90 border-neutral-800 flex flex-col justify-between hover:border-neutral-700 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs sm:text-sm">{pedido.clienteNombre}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              pedido.origen === 'web'
                                ? 'text-sky-400 border-sky-500/30 bg-sky-950/20'
                                : 'text-emerald-400 border-emerald-500/30 bg-emerald-950/20'
                            }`}
                          >
                            {pedido.origen === 'web' ? (
                              <><Globe className="mr-1 inline h-3 w-3" aria-hidden="true" /> Web</>
                            ) : (
                              <><MessageCircle className="mr-1 inline h-3 w-3" aria-hidden="true" /> WhatsApp</>
                            )}
                          </Badge>
                        </div>
                        <Badge
                          variant="default"
                          className={`text-[10px] uppercase font-bold ${
                            pedido.estado === 'pendiente'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : pedido.estado === 'en_preparacion'
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          }`}
                        >
                          {pedido.estado.replace('_', ' ')}
                        </Badge>
                      </div>

                      <div className="mt-2 text-xs text-neutral-300 space-y-1">
                        <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span>{pedido.direccion || 'Recoger en local'} {pedido.barrio ? `(${pedido.barrio})` : ''}</span></p>
                        <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" aria-hidden="true" /> {pedido.clienteTelefono}</p>
                        <p className="flex items-center gap-1.5 text-[11px] text-neutral-400"><CreditCard className="h-3.5 w-3.5" aria-hidden="true" /> Método: <span className="capitalize font-semibold text-neutral-200">{pedido.metodoPago}</span></p>
                      </div>

                      {/* Lista de Items */}
                      <div className="mt-3 p-2 bg-neutral-950/60 rounded-xl border border-neutral-800/80 space-y-1">
                        {pedido.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-neutral-300">
                            <span>{item.cantidad}x {item.nombre}</span>
                            <span className="text-neutral-400">{formatCOP(item.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-between">
                      <p className="text-lg font-bold text-gold-400 font-display">{formatCOP(pedido.total)}</p>

                      <div className="flex gap-1.5">
                        {pedido.estado === 'pendiente' && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleCambiarEstadoPedido(pedido.id, 'en_preparacion')}
                            className="text-[11px] px-2 py-1 flex items-center gap-1"
                          >
                            <Utensils size={12} />
                            A Cocina
                          </Button>
                        )}
                        {pedido.estado === 'en_preparacion' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleCambiarEstadoPedido(pedido.id, 'en_camino')}
                            className="text-[11px] px-2 py-1 flex items-center gap-1 text-sky-400"
                          >
                            <Truck size={12} />
                            A Domicilio
                          </Button>
                        )}
                        {pedido.estado === 'en_camino' && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleCambiarEstadoPedido(pedido.id, 'entregado')}
                            className="text-[11px] px-2 py-1 flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCircle size={12} />
                            Entregado
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO 2: INBOX SIN LEER */}
        {tab === 'inbox' && (
          <>
            {mensajesError && !loadingMensajes ? (
              <EmptyState
                icon={AlertCircle}
                title="No pudimos cargar la bandeja"
                description="Los mensajes no se reemplazaron por una lista vacía."
                action={{ label: 'Reintentar', onClick: cargarMensajes }}
              />
            ) : loadingMensajes ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-xl" />
                ))}
              </div>
            ) : mensajesSinLeer.length === 0 ? (
              <EmptyState icon={MessageCircle} title="Inbox al día" description="No hay mensajes nuevos pendientes por leer" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {mensajesSinLeer.map((msg) => (
                  <Card
                    key={msg.id}
                    className="p-4 bg-neutral-900/90 border-neutral-800 hover:border-neutral-700 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                        <span className="flex items-center gap-1.5 font-semibold text-white text-xs sm:text-sm"><Phone className="h-3.5 w-3.5" aria-hidden="true" /> {msg.telefono}</span>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                          Nuevo
                        </Badge>
                      </div>
                      <p className="mt-3 text-xs sm:text-sm text-neutral-300 line-clamp-3 bg-neutral-950/50 p-2.5 rounded-lg border border-neutral-800/60">
                        {msg.contenido}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-neutral-800/80 flex items-center justify-between">
                      <span className="text-[10px] text-neutral-500">
                        {formatFechaMensaje(msg.creadoEn)}
                      </span>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            handleSeleccionarConversacion(msg.telefono);
                            setTab('historial');
                          }}
                          className="text-xs px-2.5 py-1"
                        >
                          Abrir chat
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            if (msg.id) handleMarcarLeido(msg.id);
                          }}
                          className="text-xs px-2.5 py-1"
                        >
                          <CheckCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          Marcar leído
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* CONTENIDO 3: HISTORIAL & CHAT */}
        {tab === 'historial' && (
          mensajesError && !loadingMensajes ? (
            <EmptyState
              icon={AlertCircle}
              title="No pudimos cargar las conversaciones"
              description="El historial no se reemplazó por una lista vacía."
              action={{ label: 'Reintentar', onClick: cargarMensajes }}
            />
          ) : loadingMensajes ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Listado de conversaciones */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Conversaciones</h3>
              {telefonosUnicos.length === 0 ? (
                <Card className="p-4 text-center text-neutral-500 text-xs bg-neutral-900/90 border-neutral-800">
                  Sin conversaciones registradas
                </Card>
              ) : (
                <div className="space-y-2">
                  {telefonosUnicos.map((telefono) => (
                    <button
                      type="button"
                      key={telefono}
                      aria-pressed={telefonoSeleccionado === telefono}
                      className={`w-full rounded-lg border p-3 text-left shadow-lg transition-all border-neutral-800 ${
                        telefonoSeleccionado === telefono
                          ? 'bg-gold-400/20 border-l-2 border-gold-400 text-white'
                          : 'bg-neutral-900/90 hover:bg-neutral-800/50 text-neutral-300'
                      }`}
                      onClick={() => handleSeleccionarConversacion(telefono)}
                    >
                      <p className="font-semibold text-xs">{telefono}</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">
                        {mensajes.filter((m) => m.telefono === telefono).length} mensajes
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Conversación */}
            <div className="md:col-span-2">
              {telefonoSeleccionado ? (
                <Card className="flex h-96 flex-col bg-neutral-900/90 border-neutral-800">
                  <div className="border-b border-neutral-800 p-3">
                    <p className="font-semibold text-white text-xs">Chat con {telefonoSeleccionado}</p>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 p-4">
                    {loadingConversacion ? (
                      <div className="space-y-2" role="status" aria-label="Cargando conversación">
                        <Skeleton className="h-12 w-3/4 rounded-xl" />
                        <Skeleton className="ml-auto h-12 w-2/3 rounded-xl" />
                      </div>
                    ) : conversacionError ? (
                      <EmptyState
                        icon={AlertCircle}
                        title="No pudimos cargar este chat"
                        description={conversacionError}
                        action={{
                          label: 'Reintentar',
                          onClick: () => handleSeleccionarConversacion(telefonoSeleccionado),
                        }}
                      />
                    ) : conversacion.length === 0 ? (
                      <p className="text-center text-neutral-500 text-xs py-8">Sin mensajes en este chat</p>
                    ) : (
                      conversacion.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.tipo === 'salida' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-xs rounded-xl p-2.5 text-xs ${
                              msg.tipo === 'salida'
                                ? 'bg-gold-400/20 text-gold-200 border border-gold-400/30'
                                : 'bg-neutral-800 text-neutral-200 border border-neutral-700'
                            }`}
                          >
                            <p>{msg.contenido}</p>
                            <p className="mt-1 text-[10px] text-neutral-400 text-right">
                              {formatHoraMensaje(msg.creadoEn)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <form onSubmit={handleEnviarMensaje} className="border-t border-neutral-800 p-3">
                    <div className="flex gap-2">
                      <Input
                        aria-label={`Respuesta para ${telefonoSeleccionado}`}
                        value={contenidoEnvio}
                        onChange={(e) => {
                          setContenidoEnvio(e.target.value);
                          setTelefonoEnvio(telefonoSeleccionado);
                        }}
                        placeholder="Escribir respuesta al cliente..."
                        className="flex-1 text-xs"
                      />
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={enviando || loadingConversacion || Boolean(conversacionError)}
                        aria-label={enviando ? 'Enviando mensaje' : `Enviar mensaje a ${telefonoSeleccionado}`}
                      >
                        <Send size={15} aria-hidden="true" />
                      </Button>
                    </div>
                  </form>
                </Card>
              ) : (
                <Card className="p-8 text-center text-neutral-400 text-xs bg-neutral-900/90 border-neutral-800 flex items-center justify-center h-96">
                  Selecciona una conversación a la izquierda para ver el historial y responder
                </Card>
              )}
            </div>
          </div>
          )
        )}
      </div>
    </div>
  );
}
