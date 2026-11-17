import {omit} from 'es-toolkit'
import {z} from 'zod'
import {NoteCommentSchema, type NoteComment} from '@conciv/protocol/chat-message-types'

export const NoteContextItem = NoteCommentSchema.extend({commentId: z.string()})

export type NoteContextItem = z.infer<typeof NoteContextItem>

export function durableNote<Note extends NoteComment>(note: Note) {
  return omit(note, ['live'])
}

export function contextItemKey(item: NoteContextItem) {
  return `note:${item.origin}:c=${item.commentId}`
}

export function noteValue(note: NoteComment) {
  return z.json().parse(JSON.parse(JSON.stringify(note)))
}

export function noteItem(note: NoteContextItem) {
  return {key: contextItemKey(note), value: noteValue(note)}
}
