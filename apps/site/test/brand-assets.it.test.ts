import {describe, expect, it} from 'vitest'
import logos from '@conciv/brand/logos.json'
import {serveSite} from './site-fixture.js'

const ORIGIN = serveSite({port: 8794, inspectorPort: 9794})

const CONTENT_TYPE_BY_EXTENSION: Record<string, RegExp> = {
  ico: /image\/(vnd\.microsoft\.icon|x-icon)/,
  svg: /image\/svg\+xml/,
  png: /image\/png/,
  webmanifest: /(manifest\+json|application\/json)/,
}

const ROOT_ICON_PATHS = [
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-16.png',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/site.webmanifest',
]

function expectedContentType(path: string): RegExp {
  const extension = path.split('.').at(-1) ?? ''
  const pattern = CONTENT_TYPE_BY_EXTENSION[extension]
  if (!pattern) throw new Error(`No expected content-type for ${path}`)
  return pattern
}

async function fetchAsset(path: string) {
  const response = await fetch(`${ORIGIN}${path}`)
  await response.arrayBuffer()
  return {status: response.status, contentType: response.headers.get('content-type') ?? ''}
}

describe('the brand page and its assets', () => {
  it('serves /brand', async () => {
    const response = await fetch(`${ORIGIN}/brand`)
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('<title>')
  })

  it.each(ROOT_ICON_PATHS)('serves %s with an icon content-type', async (path) => {
    const asset = await fetchAsset(path)

    expect(asset.status).toBe(200)
    expect(asset.contentType).toMatch(expectedContentType(path))
  })

  it('serves every path listed in the brand manifest under /brand/', async () => {
    const paths = logos.files.map((file) => `/brand/${file.path}`)
    expect(paths.length).toBeGreaterThan(0)

    const results = await Promise.all(paths.map(async (path) => ({path, status: (await fetchAsset(path)).status})))
    const missing = results.filter((result) => result.status !== 200)

    expect(missing).toEqual([])
  }, 60_000)
})
