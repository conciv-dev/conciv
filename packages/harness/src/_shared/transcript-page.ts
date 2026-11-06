import {readdir, readFile, stat} from 'node:fs/promises'
import {join} from 'node:path'
import type {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {HarnessListPage, HarnessSessionMeta, HarnessSessionPage} from '@conciv/protocol/harness-types'
import {pageAfter} from './page.js'
import {whenMissing} from './when-missing.js'

type TranscriptFile = {name: string; id: HarnessSessionId; updatedAt: number}

export async function transcriptPage(
  dir: string,
  page: HarnessListPage,
  idOf: (name: string) => HarnessSessionId | null,
  metaOf: (id: HarnessSessionId, raw: string, updatedAt: number) => HarnessSessionMeta,
): Promise<HarnessSessionPage> {
  const names = await readdir(dir).catch(whenMissing([]))
  const stamped = await Promise.all(names.map((name) => stampedFile(dir, name, idOf)))
  const files = stamped.filter((file) => file !== null)
  const paged = pageAfter(files, page, (file) => ({updatedAt: file.updatedAt, id: file.id}))
  const read = await Promise.all(paged.items.map((file) => readMeta(dir, file, metaOf)))
  return {sessions: read.filter((meta) => meta !== null), next: paged.next}
}

async function stampedFile(
  dir: string,
  name: string,
  idOf: (name: string) => HarnessSessionId | null,
): Promise<TranscriptFile | null> {
  const id = idOf(name)
  if (id === null) return null
  const info = await stat(join(dir, name)).catch(whenMissing(null))
  return info === null ? null : {name, id, updatedAt: Math.round(info.mtimeMs)}
}

async function readMeta(
  dir: string,
  file: TranscriptFile,
  metaOf: (id: HarnessSessionId, raw: string, updatedAt: number) => HarnessSessionMeta,
): Promise<HarnessSessionMeta | null> {
  const raw = await readFile(join(dir, file.name), 'utf8').catch(whenMissing(null))
  return raw === null ? null : metaOf(file.id, raw, file.updatedAt)
}
