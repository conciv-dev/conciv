import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineAIPersistence} from '@tanstack/ai-persistence'
import {runPersistenceConformance} from '@tanstack/ai-persistence/testkit'
import {createMessageStore} from '../src/message-store.js'
import {createMetadataStore} from '../src/metadata-store.js'
import {createRunStore} from '../src/run-store.js'
import {openDb} from '../src/db.js'

runPersistenceConformance(
  'conciv-drizzle',
  () => {
    const db = openDb(mkdtempSync(join(tmpdir(), 'conciv-persistence-')))
    return defineAIPersistence({
      stores: {messages: createMessageStore(db), metadata: createMetadataStore(db), runs: createRunStore(db)},
    })
  },
  {skip: ['interrupts', 'generationRuns', 'artifacts', 'blobs']},
)
