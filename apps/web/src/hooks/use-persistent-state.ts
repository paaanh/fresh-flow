'use client';
import { useEffect, useState } from 'react';

/** Hydration-safe browser persistence for non-sensitive demo preferences and drafts. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw) setValue(JSON.parse(raw) as T); }
    catch { localStorage.removeItem(key); }
    setLoaded(true);
  }, [key]);
  useEffect(() => { if (loaded) localStorage.setItem(key, JSON.stringify(value)); }, [key, value, loaded]);
  return [value, setValue, loaded] as const;
}
