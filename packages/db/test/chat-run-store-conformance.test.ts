import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineAIPersistence} from '@tanstack/ai-persistence'
import {runPersistenceConformance} from '@tanstack/ai-persistence/testkit'
import {createRunStore} from '../src/run-store.js'
import {openDb} from '../src/db.js'

runPersistenceConformance(
  'conciv-drizzle-runs',
  () => defineAIPersistence({stores: {runs: createRunStore(openDb(mkdtempSync(join(tmpdir(), 'conciv-run-store-'))))}}),
  {skip: ['messages', 'interrupts', 'metadata', 'generationRuns', 'artifacts', 'blobs']},
)
