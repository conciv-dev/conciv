import {describe, expect, it} from 'vitest'
import {isInlineCodePath, localLinkPath} from './local-file-links.js'

describe('recognising a project file named in a reply', () => {
  it.each([
    ['a relative path', 'src/app.ts', 'src/app.ts'],
    ['a path with a line', 'src/app.ts:42', 'src/app.ts#L42'],
    ['a path with a line range after a colon', 'src/app.ts:10-20', 'src/app.ts#L10-L20'],
    ['a path with a line range hash', 'src/app.ts#L12-L20', 'src/app.ts#L12-L20'],
    ['a file URL', 'file:///workspace/src/app.ts', '/workspace/src/app.ts'],
    ['a file URL with an escaped space', 'file:///workspace/src/my%20notes.md', '/workspace/src/my notes.md'],
  ])('links %s', (_case, href, path) => {
    expect(localLinkPath(href)).toBe(path)
  })

  it.each([
    ['an outside URL', 'https://example.com/src/app.ts'],
    ['a file URL on another host', 'file://server/share/app.ts'],
    ['a path with a control character', 'src/app\u0007.ts'],
    ['a path with an escaped control character', 'src/app%07.ts'],
    ['a bare line hash', '#L12'],
  ])('does not link %s', (_case, href) => {
    expect(localLinkPath(href)).toBeUndefined()
  })

  it.each([
    ['a relative path', 'src/app.ts', true],
    ['a path with a line', 'src/app.ts:42', true],
    ['a known file name with no extension', 'README', true],
    ['an outside URL', 'https://example.com/src/app.ts', false],
    ['a shell command', 'pnpm install', false],
    ['a path with a control character', 'src/app\u0007.ts', false],
    ['a network share', '//server/share/app.ts', false],
  ])('treats inline code holding %s (%s) as a path: %s', (_case, text, isPath) => {
    expect(isInlineCodePath(text)).toBe(isPath)
  })
})
