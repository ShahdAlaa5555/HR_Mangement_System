// src/hooks/useFetch.js
import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Generic data-fetch hook.
 * Usage:
 *   const { data, loading, error, refetch } = useFetch(someAPI.list, { params });
 */
export function useFetch(fetchFn, params = null, deps = []) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const mounted = useRef(true);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFn(params);
      if (mounted.current) setData(res.data);
    } catch (err) {
      if (mounted.current) setError(err?.response?.data?.error?.message || 'An error occurred');
    } finally {
      if (mounted.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mounted.current = true;
    run();
    return () => { mounted.current = false; };
  }, [run]);

  return { data, loading, error, refetch: run };
}

/**
 * Debounce hook for search inputs.
 */
export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Local storage hook.
 */
export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initial;
    } catch { return initial; }
  });

  const set = (v) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  };

  return [value, set];
}
