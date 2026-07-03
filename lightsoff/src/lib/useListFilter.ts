import { useMemo } from 'react'

export function useListFilter<T>(items: T[], query: string, match: (item: T, q: string) => boolean): T[] {
  const q = query.trim().toLowerCase()
  return useMemo(() => {
    if (!q) return items
    return items.filter((item) => match(item, q))
  }, [items, q, match])
}

export function includesQuery(...parts: (string | number | undefined | null)[]): (q: string) => boolean {
  return (q: string) => parts.some((p) => String(p ?? '').toLowerCase().includes(q))
}
