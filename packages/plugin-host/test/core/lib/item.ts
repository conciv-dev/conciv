export function item<T>(array: readonly T[], index: number): T {
  const value = array[index]
  if (value === undefined) throw new Error(`no item at index ${index}`)
  return value
}
