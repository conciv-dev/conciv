import {inject} from 'vitest'
import {render} from '@solidjs/testing-library'
import type {Plugin, PluginOptions} from '@conciv/plugin/experimental'
import {loaders} from 'virtual:conciv-test-plugins'
import {FakeApp, type Icons, type ShellTool, type Stores} from './shell/app.js'
import {pluginEngine, type TestEngine} from './shell/engine.js'

export {pluginEngine, type TestEngine}
export type {ShellTool}

export interface MountOptions {
  readonly id?: string
  readonly options?: PluginOptions
  readonly engine?: TestEngine
  readonly tools?: readonly ShellTool[]
}

async function loadByName(name: string): Promise<{id: string; plugin: Plugin.Definition}> {
  const plugins = inject('concivTestPlugins')
  const index = plugins.findIndex((plugin) => plugin.name === name)
  const found = plugins[index]
  if (found === undefined) throw new Error(`the plugin ${name} is not among this package's dependencies`)
  if (found.kind === 'engine')
    throw new Error(
      `the plugin ${name} runs in the engine: give it to pluginEngine({plugins}) and mount its plugin-experimental part`,
    )
  const loader = loaders[index]
  if (loader === undefined) throw new Error(`the plugin ${name} has no window part to load`)
  return {id: found.id, plugin: (await loader()).default}
}

function show<S extends Stores, I extends Icons>(plugin: Plugin.Definition<S, I>, id: string, options: MountOptions) {
  render(() => (
    <FakeApp
      plugin={plugin}
      id={id}
      options={options.options ?? {}}
      engine={options.engine}
      tools={options.tools ?? []}
    />
  ))
}

export async function mount<S extends Stores, I extends Icons>(
  plugin: Plugin.Definition<S, I> | string,
  options: MountOptions = {},
): Promise<void> {
  if (typeof plugin !== 'string') return show(plugin, options.id ?? 'test-plugin', options)
  const loaded = await loadByName(plugin)
  show(loaded.plugin, options.id ?? loaded.id, options)
}
