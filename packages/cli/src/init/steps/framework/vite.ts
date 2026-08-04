import {writeFileSync} from 'node:fs'
import type {Detected} from '../../detect.js'
import type {InitStep, ManualCard} from '../../pipeline.js'
import {readConfig, restoreBackupOnExit, unifiedDiff} from './config-edit.js'
import {addToPluginsArray} from './engine.js'

const pluginModule = '@conciv/it/plugin/vite'

const quickStartSnippet = `import conciv from '${pluginModule}'
export default defineConfig({plugins: [conciv()]})`

function snippetCard(): ManualCard {
  return {
    title: 'Wire the conciv vite plugin',
    body: 'conciv could not prove the shape of your vite config. Add the plugin yourself:',
    snippet: quickStartSnippet,
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
