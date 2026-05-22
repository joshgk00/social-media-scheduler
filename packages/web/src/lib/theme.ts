const THEME_STORAGE_KEY = 'sms-theme';

type Theme = 'dark' | 'light';

function getStoredTheme(): Theme | null {
  const storedTheme = typeof window.localStorage?.getItem === 'function'
    ? window.localStorage.getItem(THEME_STORAGE_KEY)
    : null;
  return storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : null;
}

export function getPreferredTheme(): Theme {
  const storedTheme = getStoredTheme();
  if (storedTheme) return storedTheme;

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function initializeTheme() {
  document.documentElement.dataset.theme = getPreferredTheme();
}
