import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {starsResponseSchema} from '../src/lib/star-count'
import {startWranglerDev, type WranglerDev} from './wrangler-dev'

const SITE_PORT = 8793
const INSPECTOR_PORT = 9793
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
let site: WranglerDev

beforeAll(async () => {
  site = await startWranglerDev({port: SITE_PORT, inspectorPort: INSPECTOR_PORT})
}, 120_000)

afterAll(async () => {
  await site?.stop()
})

function extractTag(html: string, pattern: RegExp): string | undefined {
  return html.match(pattern)?.[1]
}

async function fetchHtml(path: string) {
  const response = await fetch(`${ORIGIN}${path}`)
  const html = await response.text()
  return {response, html}
}

const SITE = 'https://conciv.dev'

describe('per-page canonical, og:url, and title metadata', () => {
  it.each([
    ['/', `${SITE}/`],
    ['/docs', `${SITE}/docs`],
    ['/docs/quick-start', `${SITE}/docs/quick-start`],
  ])('%s self-canonicalizes and reports its own og:url', async (path, expectedUrl) => {
    const {html} = await fetchHtml(path)

    const canonical = extractTag(html, /<link rel="canonical" href="([^"]*)"/)
    const ogUrl = extractTag(html, /<meta property="og:url" content="([^"]*)"/)

    expect(canonical).toBe(expectedUrl)
    expect(ogUrl).toBe(expectedUrl)
  })

  it('gives the landing page and each docs page a distinct title', async () => {
    const [landing, docsIndex, quickStart] = await Promise.all([
      fetchHtml('/'),
      fetchHtml('/docs'),
      fetchHtml('/docs/quick-start'),
    ])

    const titles = [landing, docsIndex, quickStart].map(({html}) => extractTag(html, /<title>([^<]*)<\/title>/))

    expect(titles.every((title) => title !== undefined)).toBe(true)
    expect(new Set(titles).size).toBe(3)
  })

  it('renders real server-side navigation anchors on the landing page', async () => {
    const {html} = await fetchHtml('/')
    expect(html).toMatch(/<a[^>]*href="\/docs"/)
  })

  it.each([['/'], ['/docs/quick-start']])('renders a server-side GitHub star link anchor on %s', async (path) => {
    const {html} = await fetchHtml(path)
    expect(html).toMatch(/<a[^>]*href="https:\/\/github\.com\/conciv-dev\/conciv"/)
  })
})

describe('/api/stars', () => {
  it('returns a stars count and a cache-control header', async () => {
    const response = await fetch(`${ORIGIN}/api/stars`)
    const body = starsResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(typeof body.stars === 'number' || body.stars === null).toBe(true)
    expect(response.headers.get('cache-control')).toMatch(/^public, max-age=\d+/)
  })
})

function extractLdJson(html: string, type: string): Record<string, unknown> | undefined {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(
    (match) => match[1] ?? '',
  )

  for (const script of scripts) {
    const parsed = JSON.parse(script)
    const graph: Array<Record<string, unknown>> = Array.isArray(parsed['@graph']) ? parsed['@graph'] : []
    const node = graph.find((entry) => entry['@type'] === type)
    if (node) return node
  }

  return undefined
}

describe('structured data', () => {
  it('emits Organization and WebSite JSON-LD on the root layout', async () => {
    const {html} = await fetchHtml('/')

    const organization = extractLdJson(html, 'Organization')
    const website = extractLdJson(html, 'WebSite')

    expect(organization?.name).toBe('conciv')
    expect(website?.name).toBe('conciv')
  })

  it('emits a TechArticle for a docs page with a matching url', async () => {
    const {html} = await fetchHtml('/docs/quick-start')
    const article = extractLdJson(html, 'TechArticle')

    expect(article?.url).toBe(`${SITE}/docs/quick-start`)
  })
})

describe('per-page OG images', () => {
  it.each([['/og.png'], ['/og/quick-start.png'], ['/og/index.png']])(
    'renders a PNG for %s',
    async (path) => {
      const response = await fetch(`${ORIGIN}${path}`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('image/png')

      const body = await response.arrayBuffer()
      expect(body.byteLength).toBeGreaterThan(1000)
    },
    60_000,
  )

  it('404s for a docs page that does not exist', async () => {
    const response = await fetch(`${ORIGIN}/og/does-not-exist.png`)
    expect(response.status).toBe(404)
  })

  it('points the docs og:image meta at the generated OG image URL', async () => {
    const {html} = await fetchHtml('/docs/quick-start')
    const ogImage = extractTag(html, /<meta property="og:image" content="([^"]*)"/)

    expect(ogImage).toBe(`${SITE}/og/quick-start.png`)
  })
})

describe('the generated sitemap', () => {
  it('lists every prerendered page and every listed url resolves', async () => {
    const response = await fetch(`${ORIGIN}/sitemap.xml`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('xml')

    const xml = await response.text()
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1] ?? '')

    expect(locs.length).toBeGreaterThanOrEqual(20)
    expect(new Set(locs).size).toBe(locs.length)
    expect(locs).toContain(`${SITE}/`)

    const statuses = await Promise.all(
      locs.map(async (url) => {
        const pageResponse = await fetch(url.replace(SITE, ORIGIN))
        return pageResponse.status
      }),
    )

    expect(statuses.every((status) => status === 200)).toBe(true)
  }, 60_000)
})
