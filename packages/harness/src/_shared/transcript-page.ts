import {readdir, stat} from 'node:fs/promises'
import {join} from 'node:path'
import type {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {HarnessListPage, HarnessSessionMeta, HarnessSessionPage} from '@conciv/protocol/harness-types'
import {containedPath} from './contained-path.js'
import {pageAfter} from './page.js'
import {whenMissing} from './when-missing.js'

type TranscriptFile = {dir: string; name: string; id: HarnessSessionId; updatedAt: number; sizeBytes: number}

export type TranscriptStamp = {updatedAt: number; sizeBytes: number}

export async function transcriptPage(
  dirs: string[],
  page: HarnessListPage,
  parseId: (name: string) => HarnessSessionId | null,
  readMeta: (id: HarnessSessionId, path: string, stamp: TranscriptStamp) => Promise<HarnessSessionMeta | null>,
): Promise<HarnessSessionPage> {
  const stamped = await Promise.all(dirs.map((dir) => stampedFiles(dir, parseId)))
  const files = stamped.flat()
  const paged = pageAfter(files, page, (file) => ({updatedAt: file.updatedAt, id: file.id}))
  const read = await Promise.all(paged.items.map((file) => readMeta(file.id, join(file.dir, file.name), file)))
  return {sessions: read.filter((meta) => meta !== null), next: paged.next}
}

async function stampedFiles(
  dir: string,
  parseId: (name: string) => HarnessSessionId | null,
): Promise<TranscriptFile[]> {
  const names = await readdir(dir).catch(whenMissing([]))
  const stamped = await Promise.all(names.map((name) => stampedFile(dir, name, parseId)))
  return stamped.filter((file) => file !== null)
}

async function stampedFile(
  dir: string,
  name: string,
  parseId: (name: string) => HarnessSessionId | null,
): Promise<TranscriptFile | null> {
  const id = parseId(name)
  if (id === null || containedPath(dir, join(dir, name)) === null) return null
  const info = await stat(join(dir, name)).catch(whenMissing(null))
  return info === null ? null : {dir, name, id, updatedAt: Math.round(info.mtimeMs), sizeBytes: info.size}
}
