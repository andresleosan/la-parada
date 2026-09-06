// src/hooks/useHoraActual.ts
import { useEffect, useState } from 'react';

const TICK_MS = 15_000;

/**
 * Hora local vigente, refrescada cada 15 s.
 *
 * Sirve para mostrar con qué hora va a quedar registrada una venta: el valor que
 * se guarda es `Timestamp.now()` en el momento del cobro, no este estado.
 */
export function useHoraActual(): Date {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setAhora(new Date()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  return ahora;
}
