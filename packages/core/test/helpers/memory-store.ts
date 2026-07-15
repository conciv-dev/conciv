import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {openDb, type ConcivDb} from '@conciv/db'

export const testDb = (): ConcivDb => openDb(mkdtempSync(join(tmpdir(), 'conciv-store-')))
