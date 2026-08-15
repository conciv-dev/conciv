import {describe, expect, it} from 'vitest'
import {seo} from '../src/lib/seo'

function findMeta(tags: ReturnType<typeof seo>, key: 'name' | 'property', value: string) {
  return tags.find((tag) => JSON.stringify(tag).includes(`"${key}":"${value}"`))
}

describe('seo', () => {
  it('emits title, description, and open graph tags', () => {
    const tags = seo({title: 'A title', description: 'A description', image: 'https://conciv.dev/og.png'})

    expect(tags).toContainEqual({title: 'A title'})
    expect(findMeta(tags, 'name', 'description')).toEqual({name: 'description', content: 'A description'})
    expect(findMeta(tags, 'property', 'og:title')).toEqual({property: 'og:title', content: 'A title'})
    expect(findMeta(tags, 'property', 'og:image')).toEqual({property: 'og:image', content: 'https://conciv.dev/og.png'})
    expect(findMeta(tags, 'name', 'twitter:image')).toEqual({
      name: 'twitter:image',
      content: 'https://conciv.dev/og.png',
    })
  })

  it('defaults og:type to website', () => {
    const tags = seo({title: 'A title', description: 'A description', image: 'https://conciv.dev/og.png'})
    expect(findMeta(tags, 'property', 'og:type')).toEqual({property: 'og:type', content: 'website'})
  })

  it('honors an explicit ogType', () => {
    const tags = seo({
      title: 'A title',
      description: 'A description',
      image: 'https://conciv.dev/og.png',
      ogType: 'article',
    })
    expect(findMeta(tags, 'property', 'og:type')).toEqual({property: 'og:type', content: 'article'})
  })
})
