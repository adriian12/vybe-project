import { describe, expect, it } from 'vitest';
import { isStaleBuildError } from './stale-build';

describe('isStaleBuildError', () => {
  it('reconoce los fallos al cargar un trozo de otra versión', () => {
    expect(isStaleBuildError(new TypeError('Failed to fetch dynamically imported module: https://app.fiestea.es/assets/x.js'))).toBe(true);
    expect(isStaleBuildError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleBuildError(new Error('Unable to preload CSS for /assets/a.css'))).toBe(true);
  });

  it('no confunde los errores normales', () => {
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isStaleBuildError(null)).toBe(false);
  });
});
