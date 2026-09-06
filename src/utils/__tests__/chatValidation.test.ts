import { describe, expect, it } from 'vitest';
import {
  CHAT_MENSAJE_MAX,
  esperaRestanteChat,
  normalizarTextoChat,
  resumirMensajeChat,
  validarMensajeChat,
  validarNombreChat,
  validarTelefonoChat,
} from '../chatValidation';

describe('validación del chat en vivo', () => {
  it('normaliza espacios y saltos de línea pegados desde otra parte', () => {
    expect(normalizarTextoChat('  Ana   María \n López  ')).toBe('Ana María López');
  });

  it('exige un nombre utilizable', () => {
    expect(validarNombreChat('Ana')).toBeNull();
    expect(validarNombreChat(' A ')).toMatch(/al menos/);
    expect(validarNombreChat('a'.repeat(81))).toMatch(/no puede pasar/);
  });

  it('acepta el teléfono vacío porque es opcional', () => {
    expect(validarTelefonoChat('')).toBeNull();
    expect(validarTelefonoChat('   ')).toBeNull();
  });

  it('valida el formato del teléfono cuando sí lo escriben', () => {
    expect(validarTelefonoChat('+57 300 123 4567')).toBeNull();
    expect(validarTelefonoChat('(300) 123-4567')).toBeNull();
    expect(validarTelefonoChat('300')).toMatch(/formato/);
    expect(validarTelefonoChat('no-es-un-teléfono')).toMatch(/formato/);
  });

  it('rechaza mensajes vacíos o desmedidos', () => {
    expect(validarMensajeChat('Hola')).toBeNull();
    expect(validarMensajeChat('   ')).toMatch(/Escribe un mensaje/);
    expect(validarMensajeChat('a'.repeat(CHAT_MENSAJE_MAX))).toBeNull();
    expect(validarMensajeChat('a'.repeat(CHAT_MENSAJE_MAX + 1))).toMatch(/no puede pasar/);
  });

  it('resume el mensaje para la bandeja sin cortar los cortos', () => {
    expect(resumirMensajeChat('¿Tienen tequeños?')).toBe('¿Tienen tequeños?');
    const largo = resumirMensajeChat('a'.repeat(200));
    expect(largo).toHaveLength(120);
    expect(largo.endsWith('…')).toBe(true);
  });

  it('calcula la espera pendiente entre mensajes', () => {
    expect(esperaRestanteChat(null, 1_000)).toBe(0);
    expect(esperaRestanteChat(1_000, 4_000)).toBe(0);
    expect(esperaRestanteChat(1_000, 2_500)).toBe(500);
    // El instante exacto del límite ya habilita el envío.
    expect(esperaRestanteChat(1_000, 3_000)).toBe(0);
  });
});
