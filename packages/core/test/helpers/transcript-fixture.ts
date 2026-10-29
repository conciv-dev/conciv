import {afterEach} from 'vitest'
import {mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {bootCoreApp} from './boot.js'
import {requireClaude, requireTranscriptPath} from './adapters.js'
import {asSnapshot, type SnapshotView} from './snapshots.js'

export const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

export type TranscriptFixture = {
  kit: Kit
  sessionId: string
  transcript: string
}

export function useTranscriptFixture(prefix: string): {open: () => Promise<TranscriptFixture>} {
  const claude = requireClaude()
  const state: {kit: Kit | undefined} = {kit: undefined}
  const dirs: string[] = []

  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  return {
    open: async () => {
      const claudeHome = mkdtempSync(join(tmpdir(), `${prefix}-`))
      dirs.push(claudeHome)
      const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: () => ({})}, claudeHome})).setup()
      state.kit = kit
      const sessionId = await kit.session()
      const transcript = requireTranscriptPath(claude)(kit.stateRoot, HarnessSessionId.parse('sess-fake'), claudeHome)
      mkdirSync(dirname(transcript), {recursive: true})
      return {kit, sessionId, transcript}
    },
  }
}

export async function freshSnapshot(fixture: TranscriptFixture): Promise<SnapshotView> {
  const hydration = await fixture.kit.hydrate(fixture.sessionId)
  return asSnapshot(aguiSnapshotFor(hydration.messages))
}
