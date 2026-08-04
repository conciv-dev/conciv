import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {structuredPatch} from 'diff'
import picocolors from 'picocolors'
import type {InitContext} from '../../pipeline.js'

export type ConfigFile = {name: string; path: string; content: string}

export function readConfig(cwd: string, configFile: string | null): ConfigFile | null {
  if (configFile === null) return null
  const path = join(cwd, configFile)
  if (!existsSync(path)) return null
  return {name: configFile, path, content: readFileSync(path, 'utf8')}
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

export function writeConfigChange(ctx: InitContext, config: ConfigFile, output: string): void {
  ctx.backup({path: config.path, content: config.content})
  writeFileSync(config.path, output)
  ctx.note({title: config.name, body: coloredDiff(config.name, config.content, output)})
}
