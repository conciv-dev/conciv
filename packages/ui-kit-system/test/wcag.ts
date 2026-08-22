export type Rgba = {red: number; green: number; blue: number; alpha: number}

const HEX = /^#([0-9a-f]{6})$/i
const RGBA = /^rgba?\(([^)]+)\)$/i

function fromHex(value: string): Rgba | null {
  const match = HEX.exec(value)
  if (!match?.[1]) return null
  const digits = match[1]
  return {
    red: Number.parseInt(digits.slice(0, 2), 16) / 255,
    green: Number.parseInt(digits.slice(2, 4), 16) / 255,
    blue: Number.parseInt(digits.slice(4, 6), 16) / 255,
    alpha: 1,
  }
}

function fromRgba(value: string): Rgba | null {
  const match = RGBA.exec(value)
  if (!match?.[1]) return null
  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
  const [red, green, blue, alpha] = parts
  if (red === undefined || green === undefined || blue === undefined) return null
  return {red: red / 255, green: green / 255, blue: blue / 255, alpha: alpha ?? 1}
}

export function parseColor(value: string): Rgba {
  const parsed = fromHex(value.trim()) ?? fromRgba(value.trim())
  if (!parsed) throw new Error(`unsupported colour literal for contrast checking: ${value}`)
  return parsed
}

export function composite(foreground: Rgba, background: Rgba): Rgba {
  const blend = (channel: 'red' | 'green' | 'blue'): number =>
    foreground[channel] * foreground.alpha + background[channel] * (1 - foreground.alpha)
  return {red: blend('red'), green: blend('green'), blue: blend('blue'), alpha: 1}
}

function channelLuminance(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * channelLuminance(color.red) +
    0.7152 * channelLuminance(color.green) +
    0.0722 * channelLuminance(color.blue)
  )
}

export function contrastRatio(foreground: string, background: string): number {
  const solidBackground = parseColor(background)
  const solidForeground = composite(parseColor(foreground), solidBackground)
  const first = relativeLuminance(solidForeground)
  const second = relativeLuminance(solidBackground)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}
