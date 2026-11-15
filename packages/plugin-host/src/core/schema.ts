import {optional, statics} from '../schema/schema.js'

export {optional, statics}

export type DeepMutable<T> = T extends string | number | boolean | bigint | symbol | Function
  ? T
  : T extends readonly [unknown, ...unknown[]]
    ? {-readonly [K in keyof T]: DeepMutable<T[K]>}
    : T extends readonly (infer U)[]
      ? DeepMutable<U>[]
      : T extends object
        ? {-readonly [K in keyof T]: DeepMutable<T[K]>}
        : T
