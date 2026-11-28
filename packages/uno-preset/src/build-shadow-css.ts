import {globSync} from 'node:fs'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {createGenerator, type UserConfig} from 'unocss'

const IGNORE = ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '.generated/**']

export type BuildShadowCssOptions = {
  srcDir: string
  globs: string[]
  config: UserConfig
}

export async function buildShadowCss(options: BuildShadowCssOptions): Promise<{sourceCount: number; css: string}> {
  const files = globSync(options.globs, {cwd: options.srcDir, exclude: IGNORE})
  const generator = await createGenerator(options.config)
  const tokens = new Set<string>()
  for (const file of files) {
    await generator.applyExtractors(await readFile(join(options.srcDir, file), 'utf8'), file, tokens)
  }
  const {css} = await generator.generate(tokens)
  await mkdir(join(options.srcDir, '.generated'), {recursive: true})
  await writeFile(join(options.srcDir, '.generated/css.ts'), `export default ${JSON.stringify(css)}\n`)
  return {sourceCount: files.length, css}
}
