/** Cartesian product of option dimensions → variant combinations. */
export function cartesianProduct(options: { name: string; values: string[] }[]): Record<string, string>[] {
  if (options.length === 0) return [{}]
  return options.reduce<Record<string, string>[]>(
    (acc, opt) => acc.flatMap((combo) => opt.values.map((v) => ({ ...combo, [opt.name]: v }))),
    [{}],
  )
}

export function variantSku(baseSku: string, optionValues: Record<string, string>): string {
  const suffix = Object.values(optionValues).join('-').replace(/\s+/g, '').toUpperCase()
  return suffix ? `${baseSku}-${suffix}` : baseSku
}

export function variantTitle(optionValues: Record<string, string>): string {
  return Object.entries(optionValues).map(([k, v]) => `${k}: ${v}`).join(' / ')
}
