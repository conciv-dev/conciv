import {docsRoute} from './shared'

export function markdownPathToSlugs(segs: string[]) {
  const last = segs.at(-1)
  if (last === undefined) return []

  const out = [...segs.slice(0, -1), last.replace(/\.md$/, '')]
  return out.length === 1 && out[0] === 'index' ? [] : out
}

export function slugsToMarkdownPath(slugs: string[]) {
  const segments = [...slugs]
  if (segments.length === 0) {
    segments.push('index.md')
  } else {
    segments[segments.length - 1] += '.md'
  }

  return {
    segments,
    url: `${docsRoute}/${segments.join('/')}`,
  }
}
