import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom no implementa estas APIs y varios componentes las tocan al montarse.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

Object.defineProperty(window, 'scrollTo', { writable: true, value: vi.fn() });

// Radix mide sus disparadores al montarlos y jsdom no trae ResizeObserver:
// sin este doble, cualquier prueba que renderice un Select o un Dialog
// revienta antes de llegar a comprobar nada.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverStub,
});
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// Lo mismo con las APIs de puntero que usan los menús de Radix.
Object.defineProperty(window.HTMLElement.prototype, 'hasPointerCapture', {
  writable: true,
  value: () => false,
});
Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
  writable: true,
  value: vi.fn(),
});

if (!('IntersectionObserver' in window)) {
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
    root = null;
    rootMargin = '';
    thresholds: number[] = [];
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
  });
}
