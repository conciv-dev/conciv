import {describe, expect, it} from 'vitest'
import {buildDocsHead} from '../src/lib/docs-head'
import {DEFAULT_TITLE, SITE} from '../src/lib/site-urls'

describe('buildDocsHead', () => {
  it('builds a branded title and og:image from the page data', () => {
    const head = buildDocsHead({splat: 'quick-start', page: {title: 'Quick start', description: 'Get going'}})

    expect(head.meta).toContainEqual({title: 'Quick start — conciv'})
    expect(head.meta).toContainEqual({property: 'og:image', content: `${SITE}/og/quick-start.png`})
  })

  it('falls back to the site defaults when there is no page data', () => {
    const head = buildDocsHead({splat: undefined, page: undefined})
    expect(head.meta).toContainEqual({title: DEFAULT_TITLE})
  })

  it('emits one ld+json script with a TechArticle and BreadcrumbList', () => {
    const head = buildDocsHead({splat: 'usage/chat', page: {title: 'Chat', description: 'Chat with conciv'}})

    expect(head.scripts).toHaveLength(1)
    const parsed = JSON.parse(head.scripts[0]?.children ?? '{}')
    const types = parsed['@graph'].map((node: {'@type': string}) => node['@type'])

    expect(types).toEqual(['TechArticle', 'BreadcrumbList'])
  })
})
