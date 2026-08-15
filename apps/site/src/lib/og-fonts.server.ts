import {env} from 'cloudflare:workers'

type FontWeight = 400 | 700

type FontFile = {
  assetPath: string
  weight: FontWeight
}

type OgFont = {
  name: string
  data: Uint8Array
  weight: FontWeight
}

const FONT_FAMILY = 'Bricolage Grotesque'

const FONT_FILES: FontFile[] = [
  {assetPath: '/fonts/BricolageGrotesque-Regular.ttf', weight: 400},
  {assetPath: '/fonts/BricolageGrotesque-Bold.ttf', weight: 700},
]

async function fetchFontFile(assetPath: string, requestUrl: string): Promise<Uint8Array> {
  const response = await env.ASSETS.fetch(new URL(assetPath, requestUrl))
  if (!response.ok) {
    throw new Error(`Failed to load OG font ${assetPath}: ${response.status}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

let cachedFonts: OgFont[] | undefined

export async function loadOgFonts(requestUrl: string): Promise<OgFont[]> {
  if (cachedFonts) return cachedFonts

  const fonts = await Promise.all(
    FONT_FILES.map(async (file) => ({
      name: FONT_FAMILY,
      data: await fetchFontFile(file.assetPath, requestUrl),
      weight: file.weight,
    })),
  )

  cachedFonts = fonts
  return fonts
}
