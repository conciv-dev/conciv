import {writeFileSync, renameSync, mkdirSync} from 'node:fs'
import {dirname} from 'node:path'
import {z} from 'zod'
import {readJson} from '../fs.js'
import {statePaths} from '../state-paths.js'

// User-set session titles, keyed by harness token, in `<stateRoot>/.aidx/session-titles.json`. A
// rename overrides the transcript-derived title in the selector list. Writes are serialized through
// a promise-chain mutex + atomic tmp+rename so interleaved renames never lose an update.

const TitleMap = z.record(z.string(), z.string())

export function readTitle(stateRoot: string, sessionId: string): string | null {
  if (!sessionId) return null
  const t = readJson(statePaths(stateRoot).titles, TitleMap, {})[sessionId]
  return typeof t === 'string' && t ? t : null
}

let queue: Promise<void> = Promise.resolve()

// Upsert (or clear, when title is empty) one session's title. Returns when this write has landed.
export function writeTitle(stateRoot: string, sessionId: string, title: string): Promise<void> {
  if (!sessionId) return Promise.resolve()
  queue = queue.then(() => {
    const path = statePaths(stateRoot).titles
    const map = readJson(path, TitleMap, {})
    if (title) map[sessionId] = title
    else delete map[sessionId]
    mkdirSync(dirname(path), {recursive: true})
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(map))
    renameSync(tmp, path)
  })
  return queue
}
