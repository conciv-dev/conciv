import {describe, expect, it} from 'vitest'
import {
  buildDocsBreadcrumb,
  buildDocsPageJsonLd,
  buildRootJsonLd,
  ORGANIZATION_ID,
  WEBSITE_ID,
} from '../src/lib/structured-data'
import {SITE} from '../src/lib/site-urls'

describe('buildRootJsonLd', () => {
  it('produces valid JSON with consistent @ids between the website and organization', () => {
    const jsonLd = buildRootJsonLd()
    const parsed = JSON.parse(JSON.stringify(jsonLd))

    const website = parsed['@graph'].find((node: {'@type': string}) => node['@type'] === 'WebSite')
    const organization = parsed['@graph'].find((node: {'@type': string}) => node['@type'] === 'Organization')

    expect(website['@id']).toBe(WEBSITE_ID)
    expect(organization['@id']).toBe(ORGANIZATION_ID)
    expect(website.publisher['@id']).toBe(ORGANIZATION_ID)
  })
})

describe('buildDocsBreadcrumb', () => {
  it('is a single Docs entry for the docs index', () => {
    const breadcrumb = buildDocsBreadcrumb(undefined, 'What is conciv')
    expect(breadcrumb).toEqual([{name: 'Docs', url: `${SITE}/docs`}])
  })

  it('builds Docs -> section -> page for a nested splat', () => {
    const breadcrumb = buildDocsBreadcrumb('usage/chat', 'Chat')

    expect(breadcrumb).toEqual([
      {name: 'Docs', url: `${SITE}/docs`},
      {name: 'Usage', url: `${SITE}/docs/usage`},
      {name: 'Chat', url: `${SITE}/docs/usage/chat`},
    ])
  })
})

describe('buildDocsPageJsonLd', () => {
  it('produces valid JSON with a TechArticle and positioned breadcrumb', () => {
    const jsonLd = buildDocsPageJsonLd({
      title: 'Quick Start',
      description: 'Get started with conciv',
      url: `${SITE}/docs/quick-start`,
      image: `${SITE}/og/quick-start.png`,
      breadcrumb: [
        {name: 'Docs', url: `${SITE}/docs`},
        {name: 'Quick Start', url: `${SITE}/docs/quick-start`},
      ],
    })
    const parsed = JSON.parse(JSON.stringify(jsonLd))

    const article = parsed['@graph'].find((node: {'@type': string}) => node['@type'] === 'TechArticle')
    const breadcrumbList = parsed['@graph'].find((node: {'@type': string}) => node['@type'] === 'BreadcrumbList')

    expect(article.headline).toBe('Quick Start')
    expect(article.url).toBe(`${SITE}/docs/quick-start`)
    expect(article.isPartOf['@id']).toBe(WEBSITE_ID)
    expect(article.publisher['@id']).toBe(ORGANIZATION_ID)
    expect(breadcrumbList.itemListElement.map((item: {position: number}) => item.position)).toEqual([1, 2])
  })
})
