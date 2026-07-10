import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {makeSessionStore, openDb, type SessionStore} from '@conciv/db'

export const memoryStore = (now: () => number = () => 1): SessionStore =>
  makeSessionStore({db: openDb(mkdtempSync(join(tmpdir(), 'conciv-store-'))), now})
