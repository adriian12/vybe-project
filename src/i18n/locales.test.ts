import { describe, it, expect } from 'vitest';
import es from './locales/es.json';
import en from './locales/en.json';
import de from './locales/de.json';
import ca from './locales/ca.json';

type Dict = Record<string, unknown>;

/** Aplana un diccionario anidado en claves con puntos. */
const flatten = (obj: Dict, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([key, value]) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? flatten(value as Dict, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );

/** Extrae los marcadores {{…}} de todos los textos del diccionario. */
const placeholders = (obj: Dict, prefix = ''): Record<string, string[]> =>
  Object.entries(obj).reduce<Record<string, string[]>>((acc, [key, value]) => {
    const path = `${prefix}${key}`;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return { ...acc, ...placeholders(value as Dict, `${path}.`) };
    }
    if (typeof value === 'string') {
      const found = [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
      if (found.length > 0) acc[path] = found;
    }
    return acc;
  }, {});

const LOCALES = { en, de, ca } as const;

describe('archivos de traducción', () => {
  const baseKeys = flatten(es as Dict).sort();

  it('el español define claves', () => {
    expect(baseKeys.length).toBeGreaterThan(300);
  });

  Object.entries(LOCALES).forEach(([code, dict]) => {
    describe(code, () => {
      const keys = flatten(dict as Dict).sort();

      it('tiene exactamente las mismas claves que el español', () => {
        const missing = baseKeys.filter((k) => !keys.includes(k));
        const extra = keys.filter((k) => !baseKeys.includes(k));

        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      });

      it('conserva los mismos marcadores de interpolación', () => {
        // Un {{name}} perdido en una traducción deja el texto sin el dato.
        const basePlaceholders = placeholders(es as Dict);
        const localePlaceholders = placeholders(dict as Dict);

        const mismatches = Object.entries(basePlaceholders)
          .filter(([path, vars]) => {
            const other = localePlaceholders[path] ?? [];
            return JSON.stringify(vars) !== JSON.stringify(other);
          })
          .map(([path]) => path);

        expect(mismatches).toEqual([]);
      });

      it('no deja valores vacíos', () => {
        const empties = Object.entries(placeholders(dict as Dict)).filter(
          ([, value]) => value.length === 0,
        );
        expect(empties).toEqual([]);
      });
    });
  });
});
