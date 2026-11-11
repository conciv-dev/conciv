import {createMemo, type Accessor} from 'solid-js'
import {makeQueryUtils, useQuery, type UseQueryResult} from '@conciv/client'
import type {ChatModels, HarnessModelInfo} from '@conciv/protocol/chat-types'
import {getExtensionApi} from '@conciv/extension'
import {TERMINAL_NAME} from '../shared/protocol.js'
import {useTerminalContext} from './terminal-context.js'

const MODEL_KEY = 'conciv-model'

type TerminalModels = {
  models: UseQueryResult<ChatModels>
  list: Accessor<HarnessModelInfo[]>
  spawnModel: Accessor<string | null>
  choose: (id: string) => void
}

export function useTerminalModels(): TerminalModels {
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
