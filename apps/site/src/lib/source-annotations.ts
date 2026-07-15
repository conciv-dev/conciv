import {addSourceToJsx} from '@conciv/extension-compiler/inject-source'
import type {Plugin} from 'vite'

export function annotateSiteFile(code: string, id: string, root: string): ReturnType<typeof addSourceToJsx> {
  const file = id.split('?')[0] ?? id
  if (!file.startsWith(`${root}/src/`)) return null
  return addSourceToJsx(code, file, root)
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
