import {ImageResponse, type ImageResponseOptions} from 'takumi-js/response'
import {buildOgTree} from './og-template'
import {DEFAULT_DESCRIPTION} from './site-urls'
import {clampOgText, MAX_OG_DESCRIPTION_LENGTH, MAX_OG_TITLE_LENGTH} from './og-limits'
import {loadOgFonts} from './og-fonts.server'

export const OG_IMAGE_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
}

type OgInput = {
  title: string
  description?: string
}

async function buildOgImageResponse(input: OgInput, requestUrl: string, init?: ResponseInit) {
  const fonts = await loadOgFonts(requestUrl)

  const tree = buildOgTree({
    title: clampOgText(input.title, MAX_OG_TITLE_LENGTH),
    description: clampOgText(input.description ?? DEFAULT_DESCRIPTION, MAX_OG_DESCRIPTION_LENGTH),
  })

  const options: ImageResponseOptions = {
    width: 1200,
    height: 630,
    format: 'png',
    fonts,
    ...init,
  }

  return new ImageResponse(tree, options)
}

export async function renderOgImageResponse(
  input: OgInput,
  requestUrl: string,
  init?: ResponseInit,
): Promise<Response> {
  try {
    const response = await buildOgImageResponse(input, requestUrl, init)
    await response.ready
    return response
  } catch (error) {
    console.error('Failed to generate OG image', error)
    return new Response('Failed to generate OG image', {status: 500})
  }
}
