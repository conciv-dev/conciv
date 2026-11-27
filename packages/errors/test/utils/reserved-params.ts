import type {RegisteredErrorCatalogs} from 'evlog'
import type {} from '../../src/errors.js'

type ReservedParam = 'message' | 'status' | 'why' | 'fix' | 'link' | 'cause' | 'internal'

export type ParamKeys<Factory> = Factory extends {message: (params: infer Params) => string} ? keyof Params : never

type ReservedParamCodes = {
  [Catalog in keyof RegisteredErrorCatalogs]: {
    [Key in keyof RegisteredErrorCatalogs[Catalog] & string]: [
      ParamKeys<RegisteredErrorCatalogs[Catalog][Key]> & ReservedParam,
    ] extends [never]
      ? never
      : `${Catalog & string}.${Key}`
  }[keyof RegisteredErrorCatalogs[Catalog] & string]
}[keyof RegisteredErrorCatalogs]

export type NoneOrOffenders = [ReservedParamCodes] extends [never] ? 'none' : ReservedParamCodes

export type WalkedCatalogs = keyof RegisteredErrorCatalogs
