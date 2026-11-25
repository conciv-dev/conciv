let generated: string | undefined

export function runID(): string {
  generated ??= crypto.randomUUID().slice(0, 8)
  return generated
}
