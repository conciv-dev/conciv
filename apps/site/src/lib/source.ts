import {createElement} from 'react'
import {loader} from 'fumadocs-core/source'
import {docs} from 'collections/server'
import {
  BookMarked,
  BookOpen,
  Cpu,
  FolderGit2,
  Info,
  Joystick,
  MessagesSquare,
  Plug,
  Rocket,
  Scale,
  ShieldCheck,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import {docsRoute} from './shared'

const docsIcons: Record<string, LucideIcon> = {
  BookMarked,
  BookOpen,
  Cpu,
  FolderGit2,
  Info,
  Joystick,
  MessagesSquare,
  Plug,
  Rocket,
  Scale,
  ShieldCheck,
  Workflow,
  Wrench,
}

function docsIcon(name: string | undefined) {
  if (name === undefined) return undefined
  const icon = docsIcons[name]
  if (icon === undefined) {
    throw new Error(`docs icon "${name}" is not in docsIcons in apps/site/src/lib/source.ts; add the lucide icon there`)
  }
  return createElement(
    'span',
    {
      'data-docs-icon': '',
      className:
        'flex size-6 shrink-0 items-center justify-center rounded-md border bg-fd-background shadow-xs transition-colors [&_svg]:size-3.5! in-data-[active=true]:border-fd-primary/40 in-data-[active=true]:text-fd-primary',
    },
    createElement(icon),
  )
}
export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: docsRoute,
  icon: docsIcon,
  pageTree: {
    transformers: [
      {
        file(node, filePath) {
          if (filePath === undefined) return node
          const file = this.storage.read(filePath)
          if (file?.format !== 'page' || file.data.label === undefined) return node
          return {...node, name: file.data.label}
        },
      },
    ],
  },
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
