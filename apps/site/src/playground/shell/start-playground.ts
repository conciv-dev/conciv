import {createComponent} from 'solid-js'
import {render} from 'solid-js/web'
import {createMemoryHistory} from '@tanstack/solid-router'
import {compose, type Entry} from '@conciv/frontend-plugin-api/host'
import type {Plugin} from '@conciv/frontend-plugin-api'
import {WidgetDrive} from '@conciv/protocol/simulation'
import {builtins as pageBuiltins} from '@conciv/plugin-page/builtins'
import {builtins as terminalBuiltins} from '@internal/plugin-terminal/builtins'
import {
  ConcivApp,
  WIDGET_LAYER,
  type BuiltinPlugins,
  type ComposedPlugin,
  type Platform,
} from '@internal/frontend-defaults'
import shell from '@internal/frontend-defaults/package.json' with {type: 'json'}
import {createDemoEngine, type DemoBundle, type DemoRpc} from '../engine/demo-engine'
import {playgroundScripts} from '../playground-scripts'
import type {PlaygroundPluginId, PlaygroundScript} from '../script'
import type {StartPlayground} from '../shell-api'
import {projectVersion, shelf} from './demo-plugins'
import {createPageRpc, createTestRunnerRpc, testRunnerBundle} from './served-plugins'

type Builtin = {
  readonly id: string
  readonly plugin: Plugin.Definition
  readonly server?: boolean
  readonly toolGroup?: NonNullable<BuiltinPlugins['toolGroups']>[number]
}

type LocalPlugin = {readonly id: string; readonly plugin: Plugin.Definition}

const START = {panel: '/panel/latest?open=true', quick: '/quick'} as const

type Served = {readonly bundle: DemoBundle; readonly rpc: () => DemoRpc}

const SERVED: Partial<Record<PlaygroundPluginId, Served>> = {
  'test-runner': {bundle: testRunnerBundle, rpc: createTestRunnerRpc},
}

const LOCAL: Partial<Record<PlaygroundPluginId, LocalPlugin>> = {
  'project-version': {id: 'project-version', plugin: projectVersion},
  shelf: {id: 'shelf', plugin: shelf},
}

function staticEntry({id, plugin: {setup, ...declarations}}: Builtin): Entry {
  return {...declarations, id, windowEntry: setup && (() => Promise.resolve({default: setup}))}
}

function shellBuiltins(): BuiltinPlugins {
  const plugins: readonly Builtin[] = [...terminalBuiltins, ...pageBuiltins]
  const drive = compose({[WidgetDrive.id]: {windowEntry: () => import('@internal/frontend-defaults/drive')}})
  return {
    entries: [...plugins.map(staticEntry), ...drive],
    serverBuiltins: [...plugins.flatMap((plugin) => (plugin.server === true ? [plugin.id] : [])), WidgetDrive.id],
    toolGroups: plugins.flatMap((plugin) => (plugin.toolGroup ? [{...plugin.toolGroup, plugin: plugin.id}] : [])),
  }
}

function localPlugins(script: PlaygroundScript): readonly ComposedPlugin[] {
  return script.plugins
    .flatMap((id) => {
      const local = LOCAL[id]
      return local === undefined ? [] : staticEntry(local)
    })
    .map((entry) => [entry, {}] as const)
}

function servedPlugins(script: PlaygroundScript): readonly Served[] {
  return script.plugins.flatMap((id) => {
    const served = SERVED[id]
    return served === undefined ? [] : [served]
  })
}

function placeHost(host: HTMLElement): ShadowRoot {
  host.setAttribute('data-conciv-root', '')
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.pointerEvents = 'none'
  host.style.zIndex = String(WIDGET_LAYER)
  return host.shadowRoot ?? host.attachShadow({mode: 'open'})
}

export const startPlayground: StartPlayground = (options) => {
  const script = playgroundScripts[options.script]
  const director = new AbortController()
  const builtins = shellBuiltins()
  const served = servedPlugins(script)
  const engine = createDemoEngine({
    script,
    serverBuiltins: builtins.serverBuiltins,
    reducedMotion: options.reducedMotion,
    editPage: options.editPage,
    bundles: served.map((plugin) => plugin.bundle),
    rpc: [createPageRpc(), ...served.map((plugin) => plugin.rpc())],
    version: shell.version,
  })
  const root = placeHost(options.host)
  const container = document.createElement('div')
  root.append(container)
  const binding: ReturnType<Platform['engine']> = {
    kind: 'bound',
    apiBase: engine.apiBase,
    connection: engine.connection,
  }
  const platform: Platform = {
    engine: () => binding,
    navigation: {history: createMemoryHistory({initialEntries: [START[script.screen]]})},
    root,
    plugins: localPlugins(script),
    builtins,
    onInteractive: () => {
      engine.play(director.signal).catch((error: unknown) => {
        if (!director.signal.aborted) console.error('[playground] the script stopped', error)
      })
    },
  }
  const dispose = render(() => createComponent(ConcivApp, {platform}), container)
  return () => {
    director.abort()
    engine.dispose()
    dispose()
    container.remove()
  }
}
