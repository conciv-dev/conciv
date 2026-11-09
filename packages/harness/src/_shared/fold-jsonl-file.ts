import {createReadStream} from 'node:fs'
import {createInterface} from 'node:readline'

export async function foldJsonlFile<State>(
  path: string,
  initial: State,
  foldLine: (state: State, line: string) => State,
): Promise<State> {
  const lines = createInterface({input: createReadStream(path), crlfDelay: Number.POSITIVE_INFINITY})
  const progress = {state: initial}
  for await (const line of lines) progress.state = foldLine(progress.state, line)
  return progress.state
}
