import {globSync} from 'node:fs'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createGenerator} from 'unocss'
import {pluginSheetConfig} from './uno-preset.js'

const IGNORE = ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '.generated/**']

export async function buildPluginSheet(scriptUrl: string): Promise<string> {
  const packageUrl = new URL('..', scriptUrl).href
  const srcDir = fileURLToPath(new URL('src', packageUrl))
  const files = globSync('**/*.{ts,tsx}', {cwd: srcDir, exclude: IGNORE})
  const generator = await createGenerator(pluginSheetConfig(packageUrl))
  const tokens = new Set<string>()
  for (const file of files) {
    await generator.applyExtractors(await readFile(join(srcDir, file), 'utf8'), file, tokens)
  }
  const {css} = await generator.generate(tokens)
  await mkdir(join(srcDir, '.generated'), {recursive: true})
  await writeFile(join(srcDir, '.generated/css.ts'), `export default ${JSON.stringify(css)}\n`)
  return `CSS built (${files.length} sources, ${(css.length / 1024).toFixed(1)} kB)`
}
