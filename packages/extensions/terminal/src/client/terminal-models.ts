import {createMemo} from 'solid-js'
import {makeQueryUtils, useQuery} from '@conciv/client'
import {getExtensionApi} from '@conciv/extension'
import {TERMINAL_NAME} from '../shared/protocol.js'
import {useTerminalContext} from './terminal-context.js'

const MODEL_KEY = 'conciv-model'

export function useTerminalModels() {
  const host = getExtensionApi(TERMINAL_NAME)
  const store = useTerminalContext((context) => context.store)
  const sessionId = host.useSessionId()
  const utils = makeQueryUtils(host.useRpc())
  const stored = readStoredModel()
  const models = useQuery(() => {
    const id = sessionId()
    return utils.meta.models.queryOptions({input: {sessionId: id ?? ''}, enabled: id !== null})
  })
  const list = createMemo(() => (models.isSuccess ? models.data.models : []))
  const spawnModel = createMemo(() => {
    const candidate = store.spawnModel() ?? stored
    return candidate !== null && list().some((model) => model.id === candidate) ? candidate : null
  })
  const choose = (id: string) => {
    store.setSpawnModel(id)
    writeStoredModel(id)
  }
  return {models, list, spawnModel, choose}
}

function readStoredModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY)
  } catch {
    return null
  }
}

function writeStoredModel(id: string): void {
  try {
    localStorage.setItem(MODEL_KEY, id)
  } catch {}
}
