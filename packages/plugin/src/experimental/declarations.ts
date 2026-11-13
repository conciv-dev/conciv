import type {StoreDeclaration} from './core.js'

export type Stores = Readonly<Record<string, StoreDeclaration>>

export interface Declarations<S extends Stores = Stores> {
  readonly stores?: S
}
