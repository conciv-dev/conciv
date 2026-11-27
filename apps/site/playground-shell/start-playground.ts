import {createComponent} from 'solid-js'
import {render} from 'solid-js/web'
import {createMemoryHistory} from '@tanstack/solid-router'
import {compose, type Entry} from '@conciv/frontend-plugin-api/host'
import type {Plugin} from '@conciv/frontend-plugin-api'
import {WidgetDrive} from '@conciv/protocol/simulation'
import {builtins as pageBuiltins} from '@conciv/plugin-page/builtins'
import {builtins as terminalBuiltins} from '@internal/plugin-terminal/builtins'
import {ConcivApp, type BuiltinPlugins, type ComposedPlugin, type Platform} from '@internal/frontend-defaults'
import shell from '@internal/frontend-defaults/package.json' with {type: 'json'}
import {playgroundScripts} from '../src/playground/playground-scripts'
import type {PlaygroundPluginId, PlaygroundScript} from '../src/playground/script'
import type {StartPlayground} from '../src/playground/shell-api'
import {projectVersion, shelf} from './demo-plugins'
import type {FakeBundle} from '@internal/test-utils'
import {createPlaygroundEngine, type PlaygroundRpc} from './play-script'
import {builtinBundle, createPageRpc, createTestRunnerRpc, testRunnerBundle} from './served-plugins'

type Builtin = {
  readonly id: string
  readonly plugin: Plugin.Definition
  readonly server?: boolean
  readonly toolGroup?: NonNullable<BuiltinPlugins['toolGroups']>[number]
}

type LocalPlugin = {readonly id: string; readonly plugin: Plugin.Definition}

const START = {launcher: '/', panel: '/panel/latest?open=true', quick: '/quick'} as const

type Served = {readonly bundle: FakeBundle; readonly rpc: () => PlaygroundRpc}

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

async function loadDrive(onStarted: () => void): Promise<{default: Plugin.Setup}> {
  const drive = await import('@internal/frontend-defaults/drive')
  return {
    default: (ctx) => {
      const cleanup = drive.default(ctx)
      onStarted()
      return cleanup
    },
  }
}

function shellBuiltins(onDriveStarted: () => void): BuiltinPlugins {
  const plugins: readonly Builtin[] = [...terminalBuiltins, ...pageBuiltins]
  const drive = compose({[WidgetDrive.id]: {windowEntry: () => loadDrive(onDriveStarted)}})
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
  return host.shadowRoot ?? host.attachShadow({mode: 'open'})
}

export const startPlayground: StartPlayground = (options) => {
  const script = playgroundScripts[options.script]
  const driveStarted = Promise.withResolvers<void>()
  const builtins = shellBuiltins(driveStarted.resolve)
  const served = servedPlugins(script)
  const root = placeHost(options.host)
  const engine = createPlaygroundEngine({
    script,
    reducedMotion: options.reducedMotion,
    editPage: options.editPage,
    onProgress: options.onProgress ?? (() => undefined),
    bundles: [...(builtins.serverBuiltins ?? []).map(builtinBundle), ...served.map((plugin) => plugin.bundle)],
    rpc: [createPageRpc(), ...served.map((plugin) => plugin.rpc())],
    version: shell.version,
    widgetRoot: root,
    driveStarted: driveStarted.promise,
  })
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
      engine.play().catch((error: unknown) => console.error('[playground] the script stopped', error))
    },
  }
  const hostRouter = window.__TSR_ROUTER__
  const dispose = render(() => createComponent(ConcivApp, {platform}), container)
  window.__TSR_ROUTER__ = hostRouter
  return {
    stop: () => {
      engine.dispose()
      dispose()
      container.remove()
      window.__TSR_ROUTER__ = hostRouter
    },
    hold: engine.hold,
    resume: engine.resume,
    setSpeed: engine.setSpeed,
  }
}
