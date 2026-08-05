import type {Detected} from '../../detect.js'
import type {ManualCard} from '../../ledger.js'
import type {InitStep} from '../../pipeline.js'
import {readConfig, writeConfigChange} from './config-edit.js'
import type {Transform} from './engine.js'
import {addToPluginsArray, addToPluginsArrayRequire, pluginCallWired} from './engine.js'

type FamilyName = 'webpack' | 'rspack'

function familyName(detected: Detected): FamilyName {
  if (detected.framework === 'rspack') return 'rspack'
  return 'webpack'
}

function pluginModule(name: FamilyName): string {
  return `@conciv/it/plugin/${name}`
}

function configCard(name: FamilyName): ManualCard {
  return {
    title: `Wire the conciv ${name} plugin`,
    body: `conciv could not prove the shape of your ${name} config. Add the plugin yourself. Full steps: https://conciv.dev/docs/quick-start/${name}`,
    snippet: `const conciv = require('${pluginModule(name)}')

module.exports = {
  plugins: [conciv.default()],
}`,
  }
}

function widgetUrlCard(name: FamilyName): ManualCard {
  return {
    title: 'Inject the widget',
    body: `The ${name} plugin boots the engine but does not inject the widget for you.
The widget bundle ships as @conciv/widget/global. Serve it and set widgetUrl so the script is added to your page.
The live page bridge is Vite only. Chat, tests, and approvals work once the engine is booted and the widget is on the page.`,
  }
}

function isCommonJs(content: string): boolean {
  return content.includes('module.exports')
}

function pluginCall(content: string): string {
  if (isCommonJs(content)) return 'conciv.default()'
  return 'conciv()'
}

function transformConfig(content: string, name: FamilyName): Transform {
  if (isCommonJs(content)) {
    return addToPluginsArrayRequire(content, 'conciv', pluginModule(name), pluginCall(content))
  }
  return addToPluginsArray(content, 'conciv', pluginModule(name), pluginCall(content), {importStyle: 'default'})
}

function detectWired(cwd: string, configFile: string | null, name: FamilyName): 'missing' | 'present' {
  const config = readConfig(cwd, configFile)
  if (config === null) return 'missing'
  if (pluginCallWired(config.content, pluginModule(name), pluginCall(config.content))) return 'present'
  return 'missing'
}

export function webpackFamilyStep(detected: Detected): InitStep {
  const name = familyName(detected)
  return {
    id: 'framework',
    title: `Wire the ${name} config`,
    running: `Wiring the ${name} config…`,
    completed: `Wired the ${name} config`,
    detect: async (ctx) => detectWired(ctx.cwd, detected.configFile, name),
    plan: async () => ({
      summary: `add the ${pluginModule(name)} plugin to ${detected.configFile ?? `your ${name} config`}`,
      wouldEdit: detected.configFile === null ? [] : [detected.configFile],
    }),
    apply: async (ctx) => {
      const config = readConfig(ctx.cwd, detected.configFile)
      if (config === null) return {status: 'manual', cards: [configCard(name), widgetUrlCard(name)]}
      const transformed = transformConfig(config.content, name)
      if (!transformed.matched || transformed.output === null) {
        return {status: 'manual', cards: [configCard(name), widgetUrlCard(name)]}
      }
      writeConfigChange(ctx, config, transformed.output)
      return {status: 'manual', cards: [widgetUrlCard(name)]}
    },
    verify: async (ctx) => detectWired(ctx.cwd, detected.configFile, name) === 'present',
    manualCard: () => configCard(name),
  }
}
