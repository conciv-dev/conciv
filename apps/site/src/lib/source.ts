import {createElement} from 'react'
import {loader} from 'fumadocs-core/source'
import {docs} from 'collections/server'
import {pixelIcons} from '../components/pixel-icons'
import {docsRoute} from './shared'

function docsIcon(name: string | undefined) {
  if (name === undefined) return undefined
  const icon = pixelIcons[name]
  if (icon === undefined) {
    throw new Error(
      `docs icon "${name}" is not in pixelIcons in apps/site/src/components/pixel-icons.tsx; draw it there`,
    )
  }
  return createElement(icon)
}

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: docsRoute,
  icon: docsIcon,
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
