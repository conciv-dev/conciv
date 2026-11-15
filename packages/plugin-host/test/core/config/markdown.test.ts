import {describe, expect, test} from 'vitest'
import {ConfigMarkdown} from '../../../src/core/config/markdown.js'

const invalidYaml = `---
description: Use when the user needs to crawl pages. Keywords: crawl, scrape
---
body`

describe('ConfigMarkdown.parse', () => {
  test('recovers unquoted-colon frontmatter via the sanitize fallback', () => {
    const parsed = ConfigMarkdown.parse(invalidYaml)
    expect(parsed.data).toMatchObject({description: 'Use when the user needs to crawl pages. Keywords: crawl, scrape'})
    expect(parsed.content.trim()).toBe('body')
  })

  test('recovers a frontmatter value that starts with a bracketed tag', () => {
    const parsed = ConfigMarkdown.parse('---\ndescription: [Team] Does a thing\ntools: [read, edit]\n---\nbody')
    expect(parsed.data).toMatchObject({description: '[Team] Does a thing', tools: ['read', 'edit']})
  })

  test('recovers the same content again after a previous failed parse', () => {
    expect(() => ConfigMarkdown.parse('---\ndescription: [unclosed\n---\nbody')).toThrow()
    const parsed = ConfigMarkdown.parse(invalidYaml)
    expect(parsed.data).toMatchObject({description: 'Use when the user needs to crawl pages. Keywords: crawl, scrape'})
  })

  test('keeps throwing for the same unparseable content on every call', () => {
    const input = '---\ndescription: [unclosed\n---\nbody'
    expect(() => ConfigMarkdown.parse(input)).toThrow()
    expect(() => ConfigMarkdown.parse(input)).toThrow()
  })

  test('parses plain content without frontmatter', () => {
    const parsed = ConfigMarkdown.parse('just body')
    expect(parsed.content).toBe('just body')
    expect(parsed.data).toEqual({})
  })
})
