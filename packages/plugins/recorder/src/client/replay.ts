import {z} from 'zod'
import type {Context} from '@conciv/plugin/experimental'
import {Recorder} from '../rpc.js'
import type {RrwebEvent} from '../protocol.js'

const SavedRecording = z.object({recordingId: z.string()})

const AppendedHere = z.object({clientId: z.string()})

const APPENDED_EVENT = 'rpc.recorder.appended'

export type ReplaySource = {events: RrwebEvent[]; cursor: number}

function base64Bytes(data: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
}

export async function readVideo(client: Context['client'], clientId: string, saved: unknown): Promise<File> {
  const {recordingId} = SavedRecording.parse(saved)
  const recorder = client.rpc(Recorder)
  const read = async (offset: number, parts: Uint8Array<ArrayBuffer>[]): Promise<File> => {
    const piece = await recorder['recordings.exportVideo']({clientId, id: recordingId, offset})
    const bytes = base64Bytes(piece.data)
    if (piece.eof) return new File([...parts, bytes], piece.name, {type: piece.mime})
    return read(offset + bytes.length, [...parts, bytes])
  }
  return read(0, [])
}

function readSince(
  client: Context['client'],
  clientId: string,
  cursor: number,
  signal: AbortSignal,
): Promise<ReplaySource | undefined> {
  return client
    .rpc(Recorder)
    .since({clientId, cursor}, {signal})
    .then(
      (fresh): ReplaySource | undefined => fresh,
      (error: unknown) => {
        if (!signal.aborted) console.error('[conciv] the recorder replay could not read new events', error)
        return undefined
      },
    )
}

function cuesRead(event: {type: string; data?: unknown}, clientId: string): boolean {
  return event.type === 'server.connected' || AppendedHere.safeParse(event.data).data?.clientId === clientId
}

export async function* followRecording(
  client: Context['client'],
  clientId: () => string,
  cursor: number,
  signal: AbortSignal,
): AsyncGenerator<ReplaySource> {
  let at = cursor
  for await (const event of client.event.subscribe({types: [APPENDED_EVENT], signal})) {
    if (!cuesRead(event, clientId())) continue
    const fresh = await readSince(client, clientId(), at, signal)
    if (!fresh) continue
    at = fresh.cursor
    yield fresh
  }
}
