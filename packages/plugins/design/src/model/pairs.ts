export type Pairs<Value> = ReadonlyArray<readonly [string, Value]>

export function pick<Value>(pairs: Pairs<Value>, key: string | undefined): Value | undefined {
  return pairs.find(([candidate]) => candidate === key)?.[1]
}
