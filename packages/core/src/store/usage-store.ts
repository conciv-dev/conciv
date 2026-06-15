import {UsageSnapshotSchema, type UsageSnapshot} from '@aidx/protocol/usage-types'
import {z} from 'zod'
import {readJson, writeJson} from '../fs.js'
import {statePaths} from '../state-paths.js'

// Persists each session's last usage snapshot (keyed by sessionId) so the context tracker
// fills the moment a session is reopened, before any new turn. Lives in `<stateRoot>/.aidx/chat-usage.json`.

const UsageMapSchema = z.record(z.string(), UsageSnapshotSchema)

function readMap(stateRoot: string): Record<string, UsageSnapshot> {
  return readJson(statePaths(stateRoot).usage, UsageMapSchema, {})
}

// The persisted usage for this session, or null if none recorded yet.
export function readUsage(stateRoot: string, sessionId: string): UsageSnapshot | null {
  if (!sessionId) return null
  return readMap(stateRoot)[sessionId] ?? null
}

// Record (or replace) the latest usage for this session. No-op without a sessionId.
export function writeUsage(stateRoot: string, sessionId: string, usage: UsageSnapshot): void {
  if (!sessionId) return
  writeJson(statePaths(stateRoot).usage, {...readMap(stateRoot), [sessionId]: usage})
}
