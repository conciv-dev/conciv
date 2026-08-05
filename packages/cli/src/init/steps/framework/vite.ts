import type {Detected} from '../../detect.js'
import type {ManualCard} from '../../ledger.js'
import type {InitStep} from '../../pipeline.js'
import {readConfig, writeConfigChange} from './config-edit.js'
import {addToPluginsArray, pluginCallWired} from './engine.js'

const pluginModule = '@conciv/it/plugin/vite'
const pluginCall = 'conciv()'

const quickStartSnippet = `import conciv from '${pluginModule}'
export default defineConfig({plugins: [conciv()]})`

function snippetCard(): ManualCard {
  return {
    title: 'Wire the conciv vite plugin',
    body: 'conciv could not prove the shape of your vite config. Add the plugin yourself. Full steps: https://conciv.dev/docs/quick-start/vite',
    snippet: quickStartSnippet,
  }
}

function detectWired(cwd: string, configFile: string | null): 'missing' | 'present' {
  const config = readConfig(cwd, configFile)
  if (config === null) return 'missing'
  if (pluginCallWired(config.content, pluginModule, pluginCall)) return 'present'
  return 'missing'
}

function configName(detected: Detected): string {
  return detected.configFile ?? 'your vite config'
}

export function viteStep(detected: Detected): InitStep {
  return {
    id: 'framework',
    title: 'Wire the vite config',
    running: `Wiring ${configName(detected)}…`,
    completed: `Wired ${configName(detected)}`,
    detect: async (ctx) => detectWired(ctx.cwd, detected.configFile),
    plan: async () => ({
      summary: `add the ${pluginModule} plugin to ${detected.configFile ?? 'your vite config'}`,
      wouldEdit: detected.configFile === null ? [] : [detected.configFile],
    }),
    apply: async (ctx) => {
      const config = readConfig(ctx.cwd, detected.configFile)
      if (config === null) return {status: 'manual', cards: [snippetCard()]}
      const transformed = addToPluginsArray(config.content, 'conciv', pluginModule, pluginCall, {
        importStyle: 'default',
      })
      if (!transformed.matched || transformed.output === null) return {status: 'manual', cards: [snippetCard()]}
      writeConfigChange(ctx, config, transformed.output)
      return {status: 'done'}
    },
    verify: async (ctx) => detectWired(ctx.cwd, detected.configFile) === 'present',
    manualCard: () => snippetCard(),
  }
}
