import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {runChatStoreConformance} from '@conciv/ai/server-testkit'
import {openDb} from '@conciv/db'
import {createMessageStore} from '../src/message-store.js'
import {createMetadataStore} from '../src/metadata-store.js'
import {createRunStore} from '../src/run-store.js'

runChatStoreConformance('conciv-drizzle', () => {
  const db = openDb(mkdtempSync(join(tmpdir(), 'conciv-persistence-')))
  return {messages: createMessageStore(db), metadata: createMetadataStore(db), runs: createRunStore(db)}
})
