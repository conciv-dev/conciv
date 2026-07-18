import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createClientRings} from '../../src/server/rings.js'
import {createCaptureControl} from '../../src/server/capture-control.js'
import {createRecordingStore} from '../../src/server/recordings.js'
import type {RecorderRuntime} from '../../src/server/runtime.js'

export function runtimeFixture(): RecorderRuntime {
  const rings = createClientRings({windowMs: 60_000})
  return {
    rings,
    control: createCaptureControl(rings),
    config: {masking: 'none', windowMinutes: 10, console: true},
    renderer: async () => null,
    recordings: createRecordingStore(mkdtempSync(join(tmpdir(), 'rec-'))),
  }
}
