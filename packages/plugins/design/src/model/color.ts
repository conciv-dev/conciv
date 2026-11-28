import {differenceCiede2000, parse} from 'culori'

const difference = differenceCiede2000()

export function hex(channels: readonly number[]): string {
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

export function colorDistance(input: {a: string; b: string}): number {
  const from = parse(input.a)
  const to = parse(input.b)
  if (from === undefined || to === undefined) return 0
  return difference(from, to)
}
