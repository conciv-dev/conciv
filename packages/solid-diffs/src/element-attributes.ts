export function elementAttributes(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).map(([name, value]) => [name.includes('-') ? `attr:${name}` : name, value]),
  )
}
