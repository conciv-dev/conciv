import type {CliOutcome} from './envelope.js'
import {userFailure} from './failure.js'
import type {LocalDb} from './local-project.js'

export async function localOutcome(input: {code: string; work: (db: LocalDb) => unknown}): Promise<CliOutcome> {
  const {localProject} = await import('./local-project.js')
  const db = (await localProject()).open()
  try {
    return {report: 'json', data: await input.work(db)}
  } catch (error) {
    throw userFailure(error instanceof Error ? error.message : String(error), {code: input.code})
  }
}
