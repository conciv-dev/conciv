import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import type {Detected} from '../../detect.js'
import type {InitStep, ManualCard} from '../../pipeline.js'
import {addToPluginsArray} from './engine.js'

const pluginModule = '@conciv/it/plugin/vite'

const quickStartSnippet = `import conciv from '${pluginModule}'
export default defineConfig({plugins: [conciv()]})`

type ConfigFile = {name: string; path: string; content: string}

function readConfig(cwd: string, configFile: string | null): ConfigFile | null {
  if (configFile === null) return null
  const path = join(cwd, configFile)
  if (!existsSync(path)) return null
  return {name: configFile, path, content: readFileSync(path, 'utf8')}
}

function snippetCard(): ManualCard {
  return {
    title: 'Wire the conciv vite plugin',
    body: 'conciv could not prove the shape of your vite config. Add the plugin yourself:',
    snippet: quickStartSnippet,
  }
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

function detectWired(cwd: string, configFile: string | null): 'missing' | 'present' {
  const config = readConfig(cwd, configFile)
  if (config === null) return 'missing'
  if (config.content.includes(pluginModule)) return 'present'
  return 'missing'
}

export function viteStep(detected: Detected): InitStep {
  return {
    id: 'framework',
    title: 'Wire the vite config',
    detect: async (ctx) => detectWired(ctx.cwd, detected.configFile),
    plan: async () => ({
      summary: `add the ${pluginModule} plugin to ${detected.configFile ?? 'your vite config'}`,
      wouldEdit: detected.configFile === null ? [] : [detected.configFile],
    }),
    apply: async (ctx) => {
      const config = readConfig(ctx.cwd, detected.configFile)
      if (config === null) return {status: 'manual', cards: [snippetCard()]}
      const transformed = addToPluginsArray(config.content, 'conciv', pluginModule, 'conciv()', {
        importStyle: 'default',
      })
      if (!transformed.matched || transformed.output === null) return {status: 'manual', cards: [snippetCard()]}
      const release = restoreBackupOnExit(config.path, config.content)
      writeFileSync(config.path, transformed.output)
      release()
      ctx.report(unifiedDiff(config.name, config.content, transformed.output))
      return {status: 'done'}
    },
    verify: async (ctx) => detectWired(ctx.cwd, detected.configFile) === 'present',
    manualCard: () => snippetCard(),
  }
}
