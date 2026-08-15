import {describe, expect, it} from 'vitest'
import {
  buildSitemapXml,
  canonicalHeadTags,
  canonicalUrlFromPathname,
  docsOgImageUrl,
  docsPageUrl,
  landingPageUrl,
  SITE,
} from '../src/lib/site-urls'

describe('docsPageUrl', () => {
  it('normalizes an empty splat to the docs index', () => {
    expect(docsPageUrl(undefined)).toBe(`${SITE}/docs`)
  })

  it('builds the full path for a nested splat', () => {
    expect(docsPageUrl('usage/chat')).toBe(`${SITE}/docs/usage/chat`)
  })

  it('never has a trailing slash', () => {
    expect(docsPageUrl(undefined).endsWith('/')).toBe(false)
    expect(docsPageUrl('quick-start').endsWith('/')).toBe(false)
  })
})

describe('docsOgImageUrl', () => {
  it('normalizes an empty splat to the index image', () => {
    expect(docsOgImageUrl(undefined)).toBe(`${SITE}/og/index.png`)
  })

  it('builds the image path for a nested splat', () => {
    expect(docsOgImageUrl('usage/chat')).toBe(`${SITE}/og/usage/chat.png`)
  })
})

describe('canonicalUrlFromPathname', () => {
  it('keeps the root path as the site with a trailing slash', () => {
    expect(canonicalUrlFromPathname('/')).toBe(`${SITE}/`)
  })

  it('strips a trailing slash from a nested pathname', () => {
    expect(canonicalUrlFromPathname('/docs/quick-start/')).toBe(`${SITE}/docs/quick-start`)
  })

  it('leaves a pathname without a trailing slash untouched', () => {
    expect(canonicalUrlFromPathname('/docs/quick-start')).toBe(`${SITE}/docs/quick-start`)
  })
})

describe('canonicalHeadTags', () => {
  it('derives canonical, og:url, and twitter:url from the deepest match', () => {
    const tags = canonicalHeadTags([{pathname: '/'}, {pathname: '/docs'}, {pathname: '/docs/quick-start'}])

    expect(tags.links).toEqual([{rel: 'canonical', href: `${SITE}/docs/quick-start`}])
    expect(tags.meta).toEqual([
      {property: 'og:url', content: `${SITE}/docs/quick-start`},
      {name: 'twitter:url', content: `${SITE}/docs/quick-start`},
    ])
  })

  it('falls back to the root path when there are no matches', () => {
    const tags = canonicalHeadTags([])
    expect(tags.links).toEqual([{rel: 'canonical', href: `${SITE}/`}])
  })
})

describe('landingPageUrl', () => {
  it('is the site root with a trailing slash', () => {
    expect(landingPageUrl()).toBe(`${SITE}/`)
  })
})

describe('buildSitemapXml', () => {
  it('emits one loc per url', () => {
    const xml = buildSitemapXml([`${SITE}/`, `${SITE}/docs`, `${SITE}/docs/quick-start`])
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1])

    expect(locs).toEqual([`${SITE}/`, `${SITE}/docs`, `${SITE}/docs/quick-start`])
  })

  it('includes the landing page when passed', () => {
    const xml = buildSitemapXml([landingPageUrl()])
    expect(xml).toContain(`<loc>${SITE}/</loc>`)
  })
})
