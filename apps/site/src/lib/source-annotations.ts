import {addSourceToJsx} from '@tanstack/devtools-bundler-core'
import type {Plugin} from 'vite'

export function annotateSiteFile(code: string, id: string, root: string): ReturnType<typeof addSourceToJsx> | null {
  const file = id.split('?')[0] ?? id
  if (!file.startsWith(`${root}/src/`)) return null
  return addSourceToJsx(code, file) ?? null
}

export function sourceAnnotations(root: string): Plugin {
  return {
    name: 'site-source-annotations',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      return annotateSiteFile(code, id, root)
    },
  }
}
