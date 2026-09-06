// src/pages/BotConfigPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Bot, Save, MessageSquare, Power, ShieldCheck, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { createToast } from '@/components/ui/Toast';
import { getBotConfig, updateBotConfig } from '@/services/botConfigService';
import { Timestamp } from 'firebase/firestore';
import { useNegocio } from '@/context/NegocioContext';
import { EmptyState } from '@/components/ui/EmptyState';

export function BotConfigPage() {
  const { negocioActual } = useNegocio();
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);

  const [activo, setActivo] = useState(false);
  const [mensajeBienvenida, setMensajeBienvenida] = useState('');
  const [mensajeCierre, setMensajeCierre] = useState('');

  const cargarConfig = async () => {
    const tenantId = negocioActual.id;
    const generation = ++requestGenerationRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getBotConfig(tenantId);
      if (generation !== requestGenerationRef.current) return;
      if (data) {
        setActivo(data.activo ?? false);
        setMensajeBienvenida(data.mensajeBienvenida || `¡Hola! Bienvenido a ${negocioActual.nombre}. ¿En qué podemos ayudarte hoy?`);
        setMensajeCierre(data.mensajeCierre || `Gracias por tu pedido en ${negocioActual.nombre}. ¡Hasta pronto!`);
      } else {
        // Defaults si no existe
        setActivo(false);
        setMensajeBienvenida(`¡Hola! Bienvenido a ${negocioActual.nombre}. ¿En qué podemos ayudarte hoy?`);
        setMensajeCierre(`Gracias por tu pedido en ${negocioActual.nombre}. ¡Hasta pronto!`);
      }
    } catch (err) {
      if (generation !== requestGenerationRef.current) return;
      console.error('Error cargando config bot:', err);
      setLoadError('No fue posible consultar la configuración del bot.');
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    cargarConfig();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [negocioActual.id]);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await updateBotConfig(negocioActual.id, {
        activo,
        mensajeBienvenida,
        mensajeCierre,
        ultimaActualizacion: Timestamp.now(),
      });
      createToast('Configuración del bot guardada', 'success');
      await cargarConfig();
    } catch (err) {
      console.error('Error guardando config bot:', err);
      createToast('Error al guardar la configuración', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-base-dark pb-28 pt-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-60 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-base-dark px-4 pb-28 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-900">
          <EmptyState
            icon={AlertCircle}
            title="No pudimos cargar la automatización"
            description="La configuración no se reemplazó por valores vacíos. Reintenta antes de guardar cambios."
            action={{ label: 'Reintentar', onClick: cargarConfig }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-dark pb-28 pt-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white font-display flex items-center gap-2">
              <Bot className="h-7 w-7 text-gold-400" />
              Configuración del Bot WhatsApp
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-neutral-400">
              Gestiona el comportamiento del asistente automatizado y respuestas rápidas
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={cargarConfig}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Recargar
          </Button>
        </div>

        {/* Estado y Webhook */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 flex items-center justify-between bg-neutral-900 border-neutral-800">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${activo ? 'bg-green-500/20 text-green-400' : 'bg-neutral-800 text-neutral-500'}`}>
                <Power className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Estado del Bot</p>
                <p className="text-xs text-neutral-400">
                  {activo ? 'Activo y respondiendo órdenes' : 'Inactivo (modo manual)'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActivo(!activo)}
              aria-label={activo ? 'Desactivar bot' : 'Activar bot'}
              aria-pressed={activo}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                activo ? 'bg-green-500' : 'bg-neutral-700'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  activo ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </Card>

          <Card className="p-4 flex items-center justify-between bg-neutral-900 border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Webhook Meta API</p>
                <p className="text-xs text-neutral-400">
                  Estado de conexión
                </p>
              </div>
            </div>
            <Badge variant="outline" className="border-gold-400 text-gold-400 bg-gold-400/10">
              Pendiente de prueba sandbox
            </Badge>
          </Card>
        </div>

        {/* Formulario */}
        <form onSubmit={handleGuardar} className="space-y-5">
          <Card className="p-5 bg-neutral-900 border-neutral-800 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-gold-400" />
              Mensajes Automáticos
            </h3>

            <div className="space-y-3">
              <Textarea
                label="Mensaje de Bienvenida"
                value={mensajeBienvenida}
                onChange={(e) => setMensajeBienvenida(e.target.value)}
                placeholder="Escribe el saludo que enviará el bot al primer contacto..."
                rows={3}
              />

              <Textarea
                label="Mensaje de Cierre / Despedida"
                value={mensajeCierre}
                onChange={(e) => setMensajeCierre(e.target.value)}
                placeholder="Escribe el mensaje de despedida tras completar un pedido..."
                rows={3}
              />
            </div>
          </Card>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={guardando}
            disabled={guardando}
            className="w-full flex items-center justify-center gap-2"
          >
            <Save className="h-5 w-5" />
            {guardando ? 'Guardando configuración...' : 'Guardar Cambios'}
          </Button>
        </form>
      </div>
    </div>
  );
}
