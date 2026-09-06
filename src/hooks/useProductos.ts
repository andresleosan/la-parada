// src/hooks/useProductos.ts
import { useState, useEffect, useRef } from 'react';
import type { Producto, Combo } from '@/types';
import {
  getProductos,
  getCombos,
  onProductosChange,
  onCombosChange,
} from '@/services/productosService';
import { useNegocio } from '@/context/NegocioContext';
import { createScopedRequestGuard } from '@/utils/scopedRequestGuard';

interface UseProductosReturn {
  productos: Producto[];
  combos: Combo[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook para obtener el catálogo de productos y combos
 * Aislado automáticamente por el negocioActual (Multi-Tenant)
 */
export function useProductos(): UseProductosReturn {
  const { negocioActual } = useNegocio();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const tenantId = negocioActual.id;
  const scopeKey = tenantId;
  const activeScopeRef = useRef(scopeKey);
  const refreshGuardRef = useRef(createScopedRequestGuard());
  activeScopeRef.current = scopeKey;

  useEffect(() => {
    setLoading(true);
    setError(null);

    let unsubscribeProductos: (() => void) | null = null;
    let unsubscribeCombos: (() => void) | null = null;
    let cancelled = false;

    Promise.all([getProductos(tenantId), getCombos(tenantId)])
      .then(([prods, combs]) => {
        if (cancelled) return;
        setProductos(prods);
        setCombos(combs);
        setLoading(false);

        // Configurar listeners en tiempo real
        unsubscribeProductos = onProductosChange(tenantId, (rawProds) => {
          if (!cancelled) setProductos(rawProds);
        });
        unsubscribeCombos = onCombosChange(tenantId, (rawCombs) => {
          if (!cancelled) setCombos(rawCombs);
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      refreshGuardRef.current.invalidate();
      unsubscribeProductos?.();
      unsubscribeCombos?.();
    };
  }, [tenantId]);

  const refresh = async () => {
    const request = refreshGuardRef.current.begin(scopeKey);
    try {
      setLoading(true);
      const [prods, combs] = await Promise.all([
        getProductos(tenantId),
        getCombos(tenantId),
      ]);
      if (!refreshGuardRef.current.isCurrent(request, activeScopeRef.current)) return;
      setProductos(prods);
      setCombos(combs);
      setError(null);
    } catch (err) {
      if (!refreshGuardRef.current.isCurrent(request, activeScopeRef.current)) return;
      setError(err instanceof Error ? err : new Error('Error desconocido'));
    } finally {
      if (refreshGuardRef.current.isCurrent(request, activeScopeRef.current)) {
        setLoading(false);
      }
    }
  };

  return { productos, combos, loading, error, refresh };
}
