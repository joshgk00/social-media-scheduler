import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPreferredTheme, initializeTheme } from '../theme';

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches,
    media: '(prefers-color-scheme: light)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function mockLocalStorage(initialValue: string | null = null) {
  let storedValue = initialValue;
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => storedValue),
    setItem: vi.fn((_key: string, value: string) => {
      storedValue = value;
    }),
    clear: vi.fn(() => {
      storedValue = null;
    }),
  });
}

describe('theme initialization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
  });

  it('uses light theme on first load when the system prefers light', () => {
    mockLocalStorage();
    mockMatchMedia(true);

    expect(getPreferredTheme()).toBe('light');
    initializeTheme();

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('keeps an explicit stored theme over the system preference', () => {
    mockLocalStorage('dark');
    mockMatchMedia(true);

    initializeTheme();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
