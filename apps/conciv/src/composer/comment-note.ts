import {z} from 'zod'
import type {SendContent} from '@conciv/protocol/chat-message-types'
import type {ComposerDraft} from '@conciv/ui-kit-chat'
import {durableNote, NoteComment, NoteContextItem} from './note-schema'

const PromptAttachmentReference = z.object({name: z.string(), mime: z.string(), path: z.string()})

const PromptPresentation = z.object({
  displayText: z.string(),
  comments: z.array(z.unknown()),
  attachments: z.array(z.unknown()).catch([]),
})

const decoded = <Schema extends z.ZodType>(schema: Schema, items: readonly unknown[]): z.infer<Schema>[] =>
  items.flatMap((item) => {
    const result = schema.safeParse(item)

    return result.success ? [result.data] : []
  })

export function readPromptPresentation(metadata: unknown) {
  const presentation = PromptPresentation.safeParse(metadata)

  if (!presentation.success) return

  return {
    displayText: presentation.data.displayText,
    attachments: decoded(PromptAttachmentReference, presentation.data.attachments),
    comments: decoded(NoteComment, presentation.data.comments),
  }
}

export function noteComment(item: NoteContextItem, comment: string) {
  const note: NoteComment = {
    type: 'note',
    origin: item.origin,
    label: item.label,
    icon: item.icon,
    subject: item.subject,
    comment,
  }

  if (item.title !== undefined) note.title = item.title

  if (item.subtitle !== undefined) note.subtitle = item.subtitle

  if (item.href) note.href = item.href

  if (item.live) note.live = {...item.live}

  return note
}

export function commentContextItem(comment: NoteComment): NoteContextItem {
  return {...durableNote(comment), commentId: crypto.randomUUID()}
}

export function formatNoteComment(input: NoteComment) {
  if (!input.comment.trim()) return `The user referenced ${input.live?.subject ?? input.subject}.`

  return `The user made the following comment regarding ${input.live?.subject ?? input.subject}: ${input.comment}`
}

export function promptWithNotes(content: string | SendContent, draft: ComposerDraft): string | SendContent {
  const notes = decoded(
    NoteContextItem,
    draft.items.map((item) => item.value),
  )

  if (notes.length === 0) return content

  const comments = notes.map((note) => noteComment(note, note.comment.trim()))
  const sentences = comments.map(formatNoteComment)
  const displayText = (typeof content === 'string' ? content : draft.draft).trim()
  const metadata = {displayText, comments, attachments: []}

  if (typeof content === 'string') return {content: [displayText, ...sentences].filter(Boolean).join('\n'), metadata}

  const parts =
    typeof content.content === 'string' ? [{type: 'text' as const, content: content.content}] : content.content

  return {
    ...content,
    content: [...parts, {type: 'text', content: sentences.join('\n')}],
    metadata: {...content.metadata, ...metadata},
  }
}
