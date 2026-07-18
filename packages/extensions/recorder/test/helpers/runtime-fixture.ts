import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createEventRing} from '../../src/server/ring.js'
import {createCaptureControl} from '../../src/server/capture-control.js'
import {createRecordingStore} from '../../src/server/recordings.js'
import type {RecorderRuntime} from '../../src/server/runtime.js'

export function runtimeFixture(): RecorderRuntime {
  const ring = createEventRing({windowMs: 60_000})
  return {
    ring,
    control: createCaptureControl(ring),
    config: {masking: 'none', windowMinutes: 10, console: true},
    renderer: async () => null,
    recordings: createRecordingStore(mkdtempSync(join(tmpdir(), 'rec-'))),
  }
}
