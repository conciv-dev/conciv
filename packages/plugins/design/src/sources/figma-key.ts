import {Effect} from 'effect'
import type {Context} from '@conciv/backend-plugin-api/effect/plugin'
import {designErrors} from '../errors/errors.js'

export const FIGMA_INTEGRATION = 'figma'

export const declareFigmaKey = Effect.fn('design.declareFigmaKey')(function* (ctx: Pick<Context, 'integration'>) {
  yield* ctx.integration.transform((editor) => {
    editor.update(FIGMA_INTEGRATION, (integration) => {
      integration.name = 'Figma'
    })
    editor.method.update({integrationId: FIGMA_INTEGRATION, method: {type: 'key', label: 'Figma API key'}})
    editor.method.update({integrationId: FIGMA_INTEGRATION, method: {type: 'env', names: ['FIGMA_API_KEY']}})
  })
})

export const readFigmaKey = Effect.fn('design.readFigmaKey')(function* (ctx: Pick<Context, 'integration'>) {
  const unread = () => designErrors.FIGMA_REQUEST({detail: 'the Figma key could not be read from the credential store'})
  const active = yield* ctx.integration.connection.active(FIGMA_INTEGRATION).pipe(Effect.mapError(unread))
  if (active === undefined) return yield* Effect.fail(designErrors.FIGMA_KEY_MISSING())
  const value = yield* ctx.integration.connection.resolve(active).pipe(Effect.mapError(unread))
  if (value === undefined || value.type !== 'key') return yield* Effect.fail(designErrors.FIGMA_KEY_MISSING())
  return value.key
})
