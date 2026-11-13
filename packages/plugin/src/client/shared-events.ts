export type SelectedEvent<A extends {readonly type: string}, Type extends string> = A extends unknown
  ? [Extract<Type, A['type']>] extends [never]
    ? never
    : A
  : never

export type SubscribeOptions<Type extends string = string> = {
  readonly types?: ReadonlyArray<Type>
  readonly signal?: AbortSignal
}
