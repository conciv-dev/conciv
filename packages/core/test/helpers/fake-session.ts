import {afterEach} from 'vitest'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {createFakeHarness, type FakeHarness, type Kit} from '@conciv/harness-testkit'
import {bootKit} from './boot.js'
import {asSnapshot, type SnapshotView} from './snapshots.js'

export const SCRIPTED_REPLY = 'scripted reply'

export type FakeSession = {kit: Kit; harness: FakeHarness; sessionId: string}

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
      return {kit, harness, sessionId}
    },
  }
}

export async function hydratedSnapshot(kit: Kit, sessionId: string): Promise<SnapshotView> {
  const hydration = await kit.hydrate(sessionId)
  return asSnapshot(aguiSnapshotFor(hydration.messages))
}
