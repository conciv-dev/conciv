import {createElement} from 'react'
import {loader} from 'fumadocs-core/source'
import {docs} from 'collections/server'
import {BookMarked, Cpu, FolderGit2, Info, Joystick, Rocket, Scale, type LucideIcon} from 'lucide-react'
import {docsRoute} from './shared'

const docsIcons: Record<string, LucideIcon> = {BookMarked, Cpu, FolderGit2, Info, Joystick, Rocket, Scale}

function docsIcon(name: string | undefined) {
  if (name === undefined) return undefined
  const icon = docsIcons[name]
  if (icon === undefined) {
    throw new Error(`docs icon "${name}" is not in docsIcons in apps/site/src/lib/source.ts; add the lucide icon there`)
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
