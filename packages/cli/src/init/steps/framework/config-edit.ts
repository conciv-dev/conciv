import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {structuredPatch} from 'diff'
import picocolors from 'picocolors'
import {readOptionalText} from '../../interrupt.js'
import type {InitContext} from '../../pipeline.js'

type ConfigFile = {name: string; path: string; content: string}

export async function readConfig(cwd: string, configFile: string | null): Promise<ConfigFile | null> {
  if (configFile === null) return null
  const path = join(cwd, configFile)
  const content = await readOptionalText(path)
  if (content === null) return null
  return {name: configFile, path, content}
}

function colorDiffLine(line: string): string {
  if (line.startsWith('+')) return picocolors.green(line)
  if (line.startsWith('-')) return picocolors.red(line)
  return line
}

function coloredDiff(name: string, before: string, after: string): string {
  const patch = structuredPatch(name, name, before, after, undefined, undefined, {context: 2})
  const header = [picocolors.dim(`--- ${name}`), picocolors.dim(`+++ ${name}`)]
  const body = patch.hunks.flatMap((hunk) => [
    picocolors.cyan(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`),
    ...hunk.lines.map(colorDiffLine),
  ])
  return [...header, ...body].join('\n')
}

export async function writeConfigChange(ctx: InitContext, config: ConfigFile, output: string): Promise<void> {
  ctx.backup({path: config.path, content: config.content})
  await writeFile(config.path, output)
  ctx.note({title: config.name, body: coloredDiff(config.name, config.content, output)})
}
