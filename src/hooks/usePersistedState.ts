import { useEffect, useState } from 'react'

export function usePersistedState<T>(key: string | null, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (!key) return initial
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch { return initial }
  })

  useEffect(() => {
    if (!key) return
    try {
      const raw = localStorage.getItem(key)
      setValue(raw ? (JSON.parse(raw) as T) : initial)
    } catch { /* keep */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const set = (next: T | ((prev: T) => T)) => {
    setValue(prev => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      if (key) {
        try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* noop */ }
      }
      return v
    })
  }

  return [value, set] as const
}
