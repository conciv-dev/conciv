import {isUndefined, omit, omitBy} from 'es-toolkit'
import {z} from 'zod'
import {NoteCommentSchema, type NoteComment} from '@conciv/types/chat-message-types'
import type {DraftItem} from '@conciv/types/chat-types'

export const NoteContextItem = NoteCommentSchema.extend({commentId: z.string()})

export type NoteContextItem = z.infer<typeof NoteContextItem>

export function durableNote<Note extends NoteComment>(note: Note) {
  return omit(note, ['live'])
}

function contextItemKey(item: NoteContextItem) {
  return `note:${item.origin}:c=${item.commentId}`
}

export function noteValue(note: NoteComment): DraftItem['value'] {
  return omitBy({...note, live: note.live && omitBy(note.live, isUndefined)}, isUndefined)
}

export function decodeNotes(items: readonly DraftItem[]) {
  return items.flatMap((item) => {
    const note = NoteContextItem.safeParse(item.value)

    return note.success ? [{key: item.key, note: note.data}] : []
  })
}

export function noteItem(note: NoteContextItem) {
  return {key: contextItemKey(note), value: noteValue(note)}
}
