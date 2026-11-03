import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'
import {resolveHarnessModels, type HarnessAdapter} from '@conciv/harness'
import {HarnessModelSchema} from '@conciv/protocol/chat-types'
import type {HarnessModel} from '@conciv/protocol/harness-types'
import {logError} from './debug.js'
import {writePrivateFile} from './dev-endpoint.js'

const SavedModelsSchema = z.array(HarnessModelSchema).min(1)

function readSaved(path: string): HarnessModel[] | null {
  try {
    const parsed = SavedModelsSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function writeSaved(path: string, models: HarnessModel[]): void {
  try {
    writePrivateFile(path, JSON.stringify(models))
  } catch (error) {
    logError(`[core] the model list could not be saved: ${String(error)}`)
  }
}

export function withSavedModels(adapter: HarnessAdapter, stateDir: string): HarnessAdapter {
  if (typeof adapter.models !== 'function') return adapter
  const path = join(stateDir, `${adapter.id}-models.json`)
  const state: {saved: HarnessModel[] | null; refreshing?: Promise<HarnessModel[]>} = {saved: readSaved(path)}
  function refresh(): Promise<HarnessModel[]> {
    state.refreshing ??= resolveHarnessModels(adapter).then(
      (listed) => {
        if (listed.length === 0) throw new Error(`${adapter.id} listed no models`)
        state.saved = listed
        writeSaved(path, listed)
        return listed
      },
      (error: unknown) => {
        delete state.refreshing
        throw error
      },
    )
    return state.refreshing
  }
  function models(): Promise<HarnessModel[]> {
    const fresh = refresh()
    if (state.saved === null) return fresh
    fresh.catch((error: unknown) => logError(`[core] the model list could not be refreshed: ${String(error)}`))
    return Promise.resolve(state.saved)
  }
  return {...adapter, models}
}
