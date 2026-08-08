import {afterEach} from 'vitest'
import {EventType} from '@tanstack/ai'
import {createFakeHarness, type FakeHarness, type Kit, type RunStream} from '@conciv/harness-testkit'
import {bootKit} from './boot.js'
import {asSnapshot, type SnapshotView} from './snapshots.js'

export const SCRIPTED_REPLY = 'scripted reply'

export type FakeSession = {kit: Kit; harness: FakeHarness; sessionId: string; keeper: RunStream}

export function useFakeSessions(): {open: () => Promise<FakeSession>; adopt: (kit: Kit) => void} {
  const kits: Kit[] = []
  afterEach(async () => {
    for (const kit of kits.splice(0)) await kit.cleanup()
  })
  return {
    adopt: (kit) => {
      kits.push(kit)
    },
    open: async () => {
      const harness = createFakeHarness({text: SCRIPTED_REPLY})
      const kit = await bootKit({}, harness)
      kits.push(kit)
      const sessionId = await kit.session()
      const keeper = await kit.attach(sessionId)
      return {kit, harness, sessionId, keeper}
    },
  }
}

export async function freshSubscriberSnapshot(kit: Kit, sessionId: string): Promise<SnapshotView> {
  const fresh = await kit.attach(sessionId)
  return asSnapshot(await fresh.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {hangGuardMs: 10_000}))
}
