export * as Model from './model.js'

import {Schema} from 'effect'
import {optional} from './schema.js'
import {Provider} from './provider.js'

export const Id = Schema.String.pipe(Schema.brand('Model.ID'))
export type Id = typeof Id.Type

export const VariantId = Schema.String.pipe(Schema.brand('Model.VariantID'))
export type VariantId = typeof VariantId.Type

export const Ref = Schema.Struct({
  id: Id,
  providerId: Provider.Id,
  variant: VariantId.pipe(optional),
}).annotate({identifier: 'Model.Ref'})
export interface Ref extends Schema.Schema.Type<typeof Ref> {}
