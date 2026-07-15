import {loader} from 'fumadocs-core/source'
import {docs} from 'collections/server'
import {lucideIconsPlugin} from 'fumadocs-core/source/lucide-icons'
import {docsRoute} from './shared'

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: docsRoute,
  plugins: [lucideIconsPlugin()],
})

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

export async function getLLMText(page: (typeof source)['$inferPage']) {
  const processed = await page.data.getText('processed')

  return `# ${page.data.title} (${page.url})

${processed}`
}
