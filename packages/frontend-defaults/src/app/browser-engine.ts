import {createStore} from 'solid-js/store'
import {
  makeBrowserEngineConnection,
  normalizeApiBase,
  type BrowserEngineConnection,
  type BrowserEngineConnectionOptions,
} from '@conciv/client'
import type {Platform, PlatformEngine} from '../frontend-defaults.js'

export type BrowserEngine = {
  readonly engine: Platform['engine']
  readonly connect: NonNullable<Platform['connect']>
  readonly dispose: () => void
}

export type BrowserEngineOptions = Omit<BrowserEngineConnectionOptions, 'token'> & {
  readonly apiBase: string | undefined
}

function enteredApiBase(apiBase: string): string {
  return apiBase === '' ? '' : normalizeApiBase(apiBase)
}

export function createBrowserEngine(options: BrowserEngineOptions): BrowserEngine {
  const held: {connection: BrowserEngineConnection | undefined} = {connection: undefined}
  const open = (apiBase: string, token: string | undefined): PlatformEngine => {
    held.connection?.dispose()
    const tokenSource = token === undefined ? options.tokenSource : undefined
    const connection = makeBrowserEngineConnection(apiBase, {token, tokenSource, timings: options.timings})
    held.connection = connection
    return {kind: 'bound', apiBase, connection}
  }
  const current: {engine: PlatformEngine} = {
    engine: options.apiBase === undefined ? {kind: 'servers'} : open(enteredApiBase(options.apiBase), undefined),
  }
  const [changes, setChanges] = createStore({count: 0})
  return {
    engine: () => {
      void changes.count
      return current.engine
    },
    connect: (apiBase, token) => {
      current.engine = open(apiBase, token)
      setChanges('count', (count) => count + 1)
    },
    dispose: () => {
      held.connection?.dispose()
      held.connection = undefined
    },
  }
}
