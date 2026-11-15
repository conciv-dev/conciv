import type {HarnessAdapter} from '@conciv/harness'
import type {HarnessModel} from '@conciv/protocol/harness-types'
import {Model} from '@conciv/plugin-host'
import {Effect, Layer} from 'effect'
import {uniq} from 'es-toolkit'
import {buildHarnessMenuEntry} from '../api/rpc/sessions.js'

function harnessModelInfo(harnessId: string, model: HarnessModel): Model.Info {
  const defaults = Model.Info.default(Model.Info.fields.providerId.make(harnessId), Model.Info.fields.id.make(model.id))
  return {
    ...defaults,
    name: model.name,
    enabled: model.disabled !== true,
    limit: {context: model.contextWindow ?? defaults.limit.context, output: 0},
    variants: (model.efforts ?? []).map((effort) => ({
      id: Model.Info.fields.variants.value.fields.id.make(effort),
      settings: {effort},
    })),
  }
}

function listedModels(harness: HarnessAdapter) {
  return Effect.promise(() => buildHarnessMenuEntry(harness)).pipe(
    Effect.map((entry) => {
      const all = entry.models.map((model) => harnessModelInfo(harness.id, model))
      return {all, available: all.filter((model) => model.enabled), defaultModel: entry.defaultModel}
    }),
  )
}

export function provideHarnessModels(harness: HarnessAdapter) {
  return Layer.succeed(
    Model.Service,
    Model.Service.of({
      available: (types) =>
        listedModels(harness).pipe(
          Effect.map(({available}) =>
            types === undefined || types.length === 0
              ? available
              : uniq(types).flatMap((type) => available.filter((model) => (model.type ?? 'chat') === type)),
          ),
        ),
      default: () =>
        listedModels(harness).pipe(
          Effect.map(({all, available, defaultModel}) => {
            const requested = all.find((model) => model.id === defaultModel)
            return requested?.enabled ? requested : available[0]
          }),
        ),
    }),
  )
}
