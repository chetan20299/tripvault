import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'tv.theme';
const mq = () => window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme(theme: Theme = (localStorage.getItem(KEY) as Theme) || 'system') {
  const dark = theme === 'dark' || (theme === 'system' && mq().matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(KEY) as Theme) || 'system');
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const m = mq();
    const on = () => applyTheme('system');
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [theme]);
  return [theme, (t) => { localStorage.setItem(KEY, t); setTheme(t); }];
}
