import logos from '@conciv/brand/logos.json'

export type BrandFile = (typeof logos.files)[number]

export const BRAND_COLOURS = logos.colours

export const LOGO_LAYOUTS = ['mark', 'landscape', 'stacked', 'wordmark'] as const
export const LOGO_FORMATS = ['svg', 'png'] as const

export type LogoLayout = (typeof LOGO_LAYOUTS)[number]
export type LogoFormat = (typeof LOGO_FORMATS)[number]

const LOGO_KINDS: ReadonlyArray<string> = ['mark', 'lockup']

export function brandAssetUrl(path: string) {
  return `/brand/${path}`
}

function logoFiles(layout: LogoLayout, format: LogoFormat): BrandFile[] {
  return logos.files.filter(
    (file) => LOGO_KINDS.includes(file.kind) && file.layout === layout && file.format === format,
  )
}

export function logoTones(layout: LogoLayout, format: LogoFormat): string[] {
  return [...new Set(logoFiles(layout, format).map((file) => file.tone))]
}

export function resolveTone(layout: LogoLayout, format: LogoFormat, requested: string): string {
  const tones = logoTones(layout, format)
  if (tones.includes(requested)) return requested
  return tones[0] ?? requested
}

export function previewFile(layout: LogoLayout, tone: string): BrandFile | undefined {
  return logoFiles(layout, 'svg').find((file) => file.tone === tone)
}

export function downloadFiles(layout: LogoLayout, format: LogoFormat, tone: string): BrandFile[] {
  return logoFiles(layout, format).filter((file) => file.tone === tone)
}

const DARK_BACKDROP_NAMES: ReadonlyArray<string> = ['dark', 'charcoal']
const LIGHT_INK_TONES: ReadonlyArray<string> = ['white', 'cream', 'mono-light']

export function isDarkBackdrop(tone: string) {
  const [, backdrop] = tone.split('-on-')
  if (backdrop) return DARK_BACKDROP_NAMES.includes(backdrop)
  return LIGHT_INK_TONES.includes(tone)
}

export function faviconIcons(): BrandFile[] {
  return logos.files.filter((file) => file.kind === 'favicon' && file.format !== 'webmanifest')
}

export function socialAssets(): BrandFile[] {
  return logos.files.filter((file) => file.kind === 'social')
}

const ACRONYMS: ReadonlyArray<string> = ['og', 'svg', 'png', 'ico']

function labelWord(word: string, index: number) {
  if (ACRONYMS.includes(word)) return word.toUpperCase()
  if (index > 0) return word
  return word.charAt(0).toUpperCase() + word.slice(1)
}

export function humanLabel(value: string) {
  return value.split('-').map(labelWord).join(' ')
}

export function fileLabel(path: string) {
  const stem = path
    .split('/')
    .at(-1)
    ?.replace(/\.[^.]+$/, '')
  return humanLabel(stem ?? path)
}
