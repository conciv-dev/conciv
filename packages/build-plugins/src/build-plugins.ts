import {globSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {Rolldown} from 'tsdown'
import {createGenerator} from 'unocss'
import {presetConciv} from '@internal/uno-preset'

const INLINE_SHEET = 'virtual:uno.css?inline'
const RESOLVED_SHEET = '\0conciv-inline-sheet'

export function inlineSheet(packageUrl: string): Rolldown.Plugin {
  const source = fileURLToPath(new URL('src', packageUrl))
  return {
    name: 'conciv:inline-sheet',
    resolveId: (id) => (id === INLINE_SHEET ? RESOLVED_SHEET : null),
    load: async (id) => {
      if (id !== RESOLVED_SHEET) return null
      const generator = await createGenerator({presets: [presetConciv({sheet: 'plugin'})]})
      const files = globSync(`${source}/**/*.{ts,tsx}`, {exclude: [`${source}/**/*.{test,spec,stories}.*`]})
      const {css} = await generator.generate(files.map((file) => readFileSync(file, 'utf8')).join('\n'))
      return `export default ${JSON.stringify(css)}`
    },
  }
}
