import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import type {InitContext} from '../../pipeline.js'

export type ConfigFile = {name: string; path: string; content: string}

export function readConfig(cwd: string, configFile: string | null): ConfigFile | null {
  if (configFile === null) return null
  const path = join(cwd, configFile)
  if (!existsSync(path)) return null
  return {name: configFile, path, content: readFileSync(path, 'utf8')}
}

function unifiedDiff(name: string, before: string, after: string): string {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  let start = 0
  while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) {
    start += 1
  }
  let beforeEnd = beforeLines.length
  let afterEnd = afterLines.length
  while (beforeEnd > start && afterEnd > start && beforeLines[beforeEnd - 1] === afterLines[afterEnd - 1]) {
    beforeEnd -= 1
    afterEnd -= 1
  }
  const removed = beforeLines.slice(start, beforeEnd).map((line) => `-${line}`)
  const added = afterLines.slice(start, afterEnd).map((line) => `+${line}`)
  const hunk = `@@ -${start + 1},${beforeEnd - start} +${start + 1},${afterEnd - start} @@`
  return [`--- ${name}`, `+++ ${name}`, hunk, ...removed, ...added].join('\n')
}

export function restoreBackupOnExit(path: string, original: string): () => void {
  const restore = () => writeFileSync(path, original)
  process.on('exit', restore)
  return () => {
    process.off('exit', restore)
  }
}

export function writeConfigChange(ctx: InitContext, config: ConfigFile, output: string): void {
  const release = restoreBackupOnExit(config.path, config.content)
  writeFileSync(config.path, output)
  release()
  ctx.report(unifiedDiff(config.name, config.content, output))
}
