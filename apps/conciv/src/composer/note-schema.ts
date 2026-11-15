import {omit} from 'es-toolkit'
import {z} from 'zod'

const NoteFields = {
  type: z.literal('note'),
  origin: z.string(),
  label: z.string(),
  title: z.string().optional().catch(undefined),
  subtitle: z.string().optional().catch(undefined),
  icon: z.string(),
  subject: z.string(),
  href: z.string().optional().catch(undefined),
  live: z
    .object({subject: z.string(), href: z.string().optional().catch(undefined)})
    .optional()
    .catch(undefined),
  comment: z.string(),
}

export const NoteComment = z.object(NoteFields)

export type NoteComment = z.infer<typeof NoteComment>

export const NoteContextItem = z.object({...NoteFields, commentId: z.string()})

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
