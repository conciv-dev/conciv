import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import type {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {HarnessListPage, HarnessSessionMeta, HarnessSessionPage} from '@conciv/protocol/harness-types'
import {pageAfter} from './page.js'
import {transcriptStamps} from './transcript-stamps.js'
import {whenMissing} from './when-missing.js'

export async function transcriptPage(
  dir: string,
  page: HarnessListPage,
  idOf: (name: string) => HarnessSessionId | null,
  metaOf: (id: HarnessSessionId, raw: string, updatedAt: number) => HarnessSessionMeta,
): Promise<HarnessSessionPage> {
  const files = await transcriptStamps(dir, idOf)
  const paged = pageAfter(files, page, (file) => ({updatedAt: file.updatedAt, id: file.id}))
  const read = await Promise.all(paged.items.map((file) => readMeta(dir, file, metaOf)))
  return {sessions: read.filter((meta) => meta !== null), next: paged.next}
}

async function readMeta(
  dir: string,
  file: {id: HarnessSessionId; name: string; updatedAt: number},
  metaOf: (id: HarnessSessionId, raw: string, updatedAt: number) => HarnessSessionMeta,
): Promise<HarnessSessionMeta | null> {
  const raw = await readFile(join(dir, file.name), 'utf8').catch(whenMissing(null))
  return raw === null ? null : metaOf(file.id, raw, file.updatedAt)
}
