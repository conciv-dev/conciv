export function lazy<T>(fn: () => T) {
  let cell: {readonly value: T} | undefined

  return (): T => {
    cell ??= {value: fn()}
    return cell.value
  }
}
