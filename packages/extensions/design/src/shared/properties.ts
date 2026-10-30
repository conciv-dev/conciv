const SIDES = [
  ['left', 'inline-start'],
  ['right', 'inline-end'],
  ['top', 'block-start'],
  ['bottom', 'block-end'],
] as const

const BOXES = ['padding', 'margin', 'border'] as const

function swapSide(input: {property: string; from: string; to: string}): string | null {
  const {property, from, to} = input
  if (property === from) return `inset-${to}`
  if (property === `inset-${from}`) return to
  const box = BOXES.find((name) => property === `${name}-${from}` || property.startsWith(`${name}-${from}-`))
  if (box === undefined) return null
  return `${box}-${to}${property.slice(`${box}-${from}`.length)}`
}

export function propertyAliases(property: string): string[] {
  const swapped = SIDES.flatMap(([physical, logical]) => [
    swapSide({property, from: physical, to: logical}),
    swapSide({property, from: logical, to: physical}),
  ])
  return [property, ...swapped.filter((alias) => alias !== null)]
}

export function declares(input: {declared: string; property: string}): boolean {
  return propertyAliases(input.property).some(
    (alias) => alias === input.declared || alias.startsWith(`${input.declared}-`),
  )
}
