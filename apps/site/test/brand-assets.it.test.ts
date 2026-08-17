import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import logos from '@conciv/brand/logos.json'
import {serveSite} from './site-fixture.js'

const WebManifestSchema = z.object({icons: z.array(z.object({src: z.string()}))})

const ORIGIN = serveSite({port: 8795, inspectorPort: 9795})

const BRAND_FAVICON_DIRECTORY = new URL(
  'favicon/',
  pathToFileURL(createRequire(import.meta.url).resolve('@conciv/brand/logos.json')),
)
const SITE_PUBLIC_DIRECTORY = new URL('../public/', import.meta.url)

const COMMITTED_PUBLIC_ICONS = [
  'favicon.ico',
  'favicon-16.png',
  'favicon-32.png',
  'icon-192.png',
  'icon-512.png',
  'maskable-512.png',
  'site.webmanifest',
]

const CONTENT_TYPE_BY_EXTENSION: Record<string, RegExp> = {
  ico: /image\/(vnd\.microsoft\.icon|x-icon)/,
  svg: /image\/svg\+xml/,
  png: /image\/png/,
  webmanifest: /(manifest\+json|application\/json)/,
}

function expectedContentType(url: string): RegExp {
  const extension = url.split('.').at(-1) ?? ''
  const pattern = CONTENT_TYPE_BY_EXTENSION[extension]
  if (pattern) return pattern
  throw new Error(`No expected content-type for ${url}`)
}

async function fetchAsset(url: string) {
  const response = await fetch(`${ORIGIN}${url}`)
  await response.arrayBuffer()
  return {url, status: response.status, contentType: response.headers.get('content-type') ?? ''}
}

function matchAll(html: string, pattern: RegExp) {
  return [...new Set([...html.matchAll(pattern)].flatMap((match) => (match[1] ? [match[1]] : [])))]
}

function downloadHrefs(html: string) {
  return matchAll(html, /<a[^>]+href="([^"]+)"[^>]*\sdownload/g)
}

function imageSources(html: string) {
  return matchAll(html, /<img[^>]+src="([^"]+)"/g)
}

function headIconHrefs(html: string) {
  return matchAll(html, /<link[^>]+rel="(?:icon|apple-touch-icon|manifest)"[^>]+href="([^"]+)"/g)
}

async function fetchHtml(path: string) {
  const response = await fetch(`${ORIGIN}${path}`)
  const html = await response.text()
  return {status: response.status, html}
}

async function expectAllServed(urls: string[]) {
  const results = await Promise.all(urls.map(fetchAsset))
  const broken = results.filter((result) => result.status !== 200)

  expect(broken).toEqual([])
  results.forEach((result) => {
    expect(result.contentType).toMatch(expectedContentType(result.url))
  })
}

describe('the brand page and its assets', () => {
  it('serves /brand', async () => {
    const page = await fetchHtml('/brand')

    expect(page.status).toBe(200)
    expect(page.html).toContain('<title>')
  })

  it('serves every download link offered on /brand', async () => {
    const page = await fetchHtml('/brand')
    const hrefs = downloadHrefs(page.html)

    expect(hrefs.length).toBeGreaterThan(0)
    await expectAllServed(hrefs)
  }, 60_000)

  it('serves every preview image rendered on /brand', async () => {
    const page = await fetchHtml('/brand')
    const sources = imageSources(page.html)

    expect(sources.length).toBeGreaterThan(0)
    await expectAllServed(sources)
  }, 60_000)

  it('offers a download for every favicon and social asset in the brand catalogue', async () => {
    const page = await fetchHtml('/brand')
    const hrefs = downloadHrefs(page.html)
    const expectedNames = logos.files
      .filter((file) => (file.kind === 'favicon' || file.kind === 'social') && file.format !== 'webmanifest')
      .map((file) =>
        file.path
          .split('/')
          .at(-1)
          ?.replace(/\.[^.]+$/, ''),
      )
    const missing = expectedNames.filter((name) => !hrefs.some((href) => name && href.includes(name)))

    expect(missing).toEqual([])
  })

  it('serves every icon the document head links to', async () => {
    const page = await fetchHtml('/')
    const hrefs = headIconHrefs(page.html)

    expect(hrefs.length).toBeGreaterThan(0)
    await expectAllServed(hrefs)
  })

  it.each(COMMITTED_PUBLIC_ICONS)('serves the committed /%s the webmanifest depends on', async (name) => {
    const asset = await fetchAsset(`/${name}`)

    expect(asset.status).toBe(200)
    expect(asset.contentType).toMatch(expectedContentType(name))
  })

  it.each(COMMITTED_PUBLIC_ICONS)('keeps the committed public %s identical to the brand package', async (name) => {
    const committed = await readFile(fileURLToPath(new URL(name, SITE_PUBLIC_DIRECTORY)))
    const source = await readFile(fileURLToPath(new URL(name, BRAND_FAVICON_DIRECTORY)))

    expect(committed.equals(source)).toBe(true)
  })

  it('points every webmanifest icon at a path the site serves', async () => {
    const response = await fetch(`${ORIGIN}/site.webmanifest`)
    const manifest = WebManifestSchema.parse(await response.json())
    const sources = manifest.icons.map((icon) => icon.src)

    expect(sources.length).toBeGreaterThan(0)
    await expectAllServed(sources)
  })
})
