import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {afterAll, describe, expect, it} from 'vitest'
import {expect as expectLocator, type Locator, type Page} from 'playwright/test'
import {devices} from 'playwright'
import {z} from 'zod'
import logos from '@conciv/brand/logos.json'
import {createFakeHarness} from '@conciv/harness-testkit'
import {runConnect} from '@conciv/try'
import type {Engine} from '@conciv/core/start'
import {starsResponseSchema} from '../src/lib/star-count'
import {createSiteTest, serveSite} from './helpers.js'

const liveConnectTest = createSiteTest({port: 8787, inspectorPort: 9787})
const mobileGatingTest = createSiteTest({port: 8788, inspectorPort: 9788})
const robotFabTest = createSiteTest({port: 8794, inspectorPort: 9794})

describe('brand assets', () => {
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
})

describe('live connect', () => {
  const SITE_PORT = 8787
  const ORIGIN = `http://127.0.0.1:${SITE_PORT}`

  const test = liveConnectTest

  let engine: Engine | null = null

  afterAll(async () => {
    await engine?.stop()
  })

  async function openLandingOnConnectSteps(page: Page): Promise<Locator> {
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})
    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await expectLocator(panel.getByText('Drive this page with your agent.')).toBeVisible({timeout: 20_000})
    return panel
  }

  async function dismissAndReload(page: Page, panel: Locator): Promise<void> {
    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expectLocator(panel).toBeHidden({timeout: 10_000})
    await page.reload({waitUntil: 'domcontentloaded'})
    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 20_000})
    expect(await panel.isVisible()).toBe(false)
  }

  test.describe('widget-native live connect on the built site', () => {
    test('opens the panel for a click that lands before the widget bundle has mounted', async ({browser}) => {
      const page = await browser.newPage()
      await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})
      await page.getByRole('button', {name: /Try it live/i}).click()
      await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 20_000})

      await page.close()
    }, 60_000)

    test('boots the widget into connect steps and hands off in place to live chat', async ({browser}) => {
      const page = await browser.newPage()
      const panel = await openLandingOnConnectSteps(page)

      const command = await panel
        .getByText(/^npx @conciv\/try --token \S+$/)
        .filter({visible: true})
        .textContent()
      const token = command?.match(/--token (\S+)/)?.[1] ?? ''
      expect(token).not.toBe('')

      const before = await panel.elementHandle()
      engine = await runConnect({
        token,
        harnessAdapter: createFakeHarness({id: 'fake-e2e', text: 'hello from e2e'}),
        origin: ORIGIN,
      })

      const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await expectLocator(input).toBeVisible({timeout: 30_000})

      const sameNode = await page.evaluate(
        (node) =>
          node === document.querySelector('[data-conciv-root]')?.shadowRoot?.querySelector('[data-conciv-panel]'),
        before,
      )
      expect(sameNode).toBe(true)
      await expectLocator(panel.getByText('Agent connected. It’s driving this page from your machine.')).toBeVisible({
        timeout: 10_000,
      })

      await input.fill('hello')
      await input.press('Enter')
      await expectLocator(page.getByText('hello from e2e').first()).toBeVisible({timeout: 30_000})

      await page.reload({waitUntil: 'domcontentloaded'})
      const inputAfterReload = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await expectLocator(inputAfterReload).toBeVisible({timeout: 30_000})
      await page.close()

      await engine.stop()
      engine = null
    }, 180_000)

    test('remembers a pre-connect dismissal, and ?try=1 forces the panel open again', async ({browser}) => {
      const page = await browser.newPage()
      const panel = await openLandingOnConnectSteps(page)
      await dismissAndReload(page, panel)

      await page.goto(`${ORIGIN}/?try=1`, {waitUntil: 'domcontentloaded'})
      await expectLocator(panel.getByText('Drive this page with your agent.')).toBeVisible({timeout: 20_000})
      await page.close()
    }, 90_000)

    test('the button reopens the panel after a dismiss-then-reload re-entry', async ({browser}) => {
      const page = await browser.newPage()
      const panel = await openLandingOnConnectSteps(page)
      await dismissAndReload(page, panel)

      await page.getByRole('button', {name: /Try it live/i}).click()
      await expectLocator(panel).toBeVisible({timeout: 20_000})

      await page.close()
    }, 90_000)
  })
})

describe('mobile gating', () => {
  const SITE_PORT = 8788
  const ORIGIN = `http://127.0.0.1:${SITE_PORT}`

  const test = mobileGatingTest

  test.describe('landing gates the dev-only demo behind a non-mobile pointer', () => {
    test('mounts the live widget and shows the install + try-it CTAs on desktop', async ({browser}) => {
      const page = await browser.newPage()
      await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

      await expectLocator(page.locator('[data-conciv-root]')).toHaveCount(1, {timeout: 20_000})
      await expectLocator(page.getByRole('button', {name: 'Copy install command'})).toBeVisible()
      await expectLocator(page.getByRole('button', {name: /Try it live/i})).toBeVisible()

      await page.close()
    }, 60_000)

    test('does not mount the live widget or the CTAs on a mobile device', async ({browser}) => {
      const context = await browser.newContext(devices['iPhone 13'])
      const page = await context.newPage()
      await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

      await expectLocator(page.getByRole('button', {name: 'Copy install command'})).toHaveCount(0, {timeout: 20_000})
      await expectLocator(page.getByRole('button', {name: /Try it live/i})).toHaveCount(0)
      await expectLocator(page.locator('[data-conciv-root]')).toHaveCount(0)
      await expectLocator(page.getByText('desktop-only')).toBeVisible()
      await expectLocator(page.getByRole('link', {name: 'Read the quick start →'})).toBeVisible()

      await context.close()
    }, 60_000)
  })

  test.describe('the live widget mounts site-wide and the root widget param decides the panel', () => {
    test('shows the launcher with the panel closed on a docs page on desktop', async ({browser}) => {
      const page = await browser.newPage()
      await page.goto(`${ORIGIN}/docs/quick-start`, {waitUntil: 'domcontentloaded'})

      await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 20_000})
      await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden()

      await page.close()
    }, 60_000)

    test('auto-opens the panel on the home page without a widget param in the URL', async ({browser}) => {
      const page = await browser.newPage()
      await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

      await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 20_000})
      expect(new URL(page.url()).searchParams.has('widget')).toBe(false)

      await page.close()
    }, 60_000)

    test('keeps the panel closed on the home page when ?widget=false is explicit', async ({browser}) => {
      const page = await browser.newPage()
      await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})

      await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 20_000})
      await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden()

      await page.close()
    }, 60_000)

    test('keeps the open panel mounted while navigating from the landing page to the docs', async ({browser}) => {
      const page = await browser.newPage()
      await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

      const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
      await expectLocator(panel).toBeVisible({timeout: 20_000})

      await page.getByRole('navigation').getByRole('link', {name: 'Docs', exact: true}).click()

      await expectLocator(page).toHaveURL(/\/docs\/?$/)
      await expectLocator(panel).toBeVisible()

      await page.close()
    }, 60_000)

    test('keeps a closed panel closed across navigation to the docs and back to the landing page', async ({
      browser,
    }) => {
      const page = await browser.newPage()
      await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

      const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
      await expectLocator(panel).toBeVisible({timeout: 20_000})

      await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
      await expectLocator(panel).toBeHidden()

      await page.getByRole('navigation').getByRole('link', {name: 'Docs', exact: true}).click()
      await expectLocator(page).toHaveURL(/\/docs\/?$/)
      await expectLocator(panel).toBeHidden()

      await page.getByRole('link', {name: 'conciv', exact: true}).first().click()
      await expectLocator(page).toHaveURL(`${ORIGIN}/`)
      await expectLocator(panel).toBeHidden()

      await page.close()
    }, 60_000)

    test('opens the panel on a docs page when ?widget=true is explicit', async ({browser}) => {
      const page = await browser.newPage()
      await page.goto(`${ORIGIN}/docs/quick-start?widget=true`, {waitUntil: 'domcontentloaded'})

      await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 20_000})

      await page.close()
    }, 60_000)
  })
})

describe('robot fab', () => {
  const SITE_PORT = 8794
  const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
  const LANDING = `${ORIGIN}/?widget=false`

  const test = robotFabTest

  const restingFab = (page: Page): Locator => page.getByRole('button', {name: 'Make the robot think'})

  const workingFab = (page: Page): Locator => page.getByRole('button', {name: 'Stop the robot thinking'})

  const mascotOf = (fab: Locator): Locator => fab.locator('[data-scope="mascot"][data-part="root"]')

  const emitterOf = (fab: Locator): Locator => fab.locator('[data-scope="mascot"][data-part="effect"] > span')

  test.describe('the landing robot fab rides the mascot compound api', () => {
    test('leaves no mascot or emitter behind when the landing page unmounts', async ({browser}) => {
      const page = await browser.newPage()
      await page.goto(LANDING, {waitUntil: 'domcontentloaded'})

      const fab = restingFab(page)
      await expectLocator(fab).toBeVisible({timeout: 20_000})
      await fab.click()
      await expectLocator(emitterOf(workingFab(page))).toHaveCount(1)

      await page.getByRole('navigation').getByRole('link', {name: 'Docs', exact: true}).click()
      await expectLocator(page).toHaveURL(/\/docs(\?|$)/)
      await expectLocator(workingFab(page)).toHaveCount(0)
      await expectLocator(page.locator('[data-scope="mascot"][data-part="effect"] > span')).toHaveCount(0)

      await page.getByRole('link', {name: 'conciv', exact: true}).first().click()
      await expectLocator(page).toHaveURL(new RegExp(`${SITE_PORT}/(\\?|$)`))
      const remounted = restingFab(page)
      await expectLocator(mascotOf(remounted)).toHaveCount(1)
      await expectLocator(emitterOf(remounted)).toHaveCount(0)

      await page.close()
    }, 60_000)
  })
})

describe('seo metadata', () => {
  const ORIGIN = serveSite({port: 8793, inspectorPort: 9793})

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
      expect(html).toContain('<a href="https://github.com/conciv-dev/conciv"')
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
})

describe('worker routes', () => {
  const ORIGIN = serveSite({port: 8792, inspectorPort: 9792})

  function servedByWorker(response: Response): boolean {
    return response.headers.get('etag') === null && response.headers.get('cf-cache-status') === null
  }

  async function markdownRoutes(): Promise<string[]> {
    const response = await fetch(`${ORIGIN}/llms.txt`)
    expect(response.status).toBe(200)
    const index = await response.text()
    const docs = [...new Set([...index.matchAll(/\((\/docs[^)]*)\)/g)].flatMap((match) => match[1] ?? []))]
    return docs.map((route) => (route === '/docs' ? '/docs/index.md' : `${route}.md`))
  }

  describe('the built worker renders every route it serves', () => {
    it('renders the markdown of every documented page, from the worker itself', async () => {
      const routes = await markdownRoutes()
      expect(routes.length).toBeGreaterThan(5)

      const failures = await Promise.all(
        routes.map(async (route) => {
          const response = await fetch(`${ORIGIN}${route}`)
          const body = await response.text()
          const broken = /Internal Server Error|Cannot find module|No such module|ReferenceError/i.test(body)
          if (!servedByWorker(response))
            return `${route} was served as a static asset, so the worker was never exercised`
          return response.status === 200 && !broken
            ? null
            : `${route} -> ${response.status}${broken ? ' (error in body)' : ''}`
        }),
      )

      expect(failures.filter((failure) => failure !== null)).toEqual([])
    }, 120_000)

    it('renders a not-found docs page through the worker rather than crashing', async () => {
      const response = await fetch(`${ORIGIN}/docs/this-page-does-not-exist`)
      expect(servedByWorker(response)).toBe(true)
      expect(response.status).toBe(404)
      expect(await response.text()).not.toMatch(/Internal Server Error|No such module/i)
    }, 60_000)
  })
})
