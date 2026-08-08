import {getSchema} from '@tiptap/core'
import {Document} from '@tiptap/extension-document'
import {Paragraph} from '@tiptap/extension-paragraph'
import {Text} from '@tiptap/extension-text'
import {Mention} from '@tiptap/extension-mention'
import type {Node as ProseMirrorNode} from '@tiptap/pm/model'

const chipName = Mention.name

function chipLeafText(node: ProseMirrorNode): string {
  return `${String(node.attrs.mentionSuggestionChar ?? '@')}${String(node.attrs.id ?? '')}`
}

export const documentExtensions = [Document, Paragraph, Text]

export const chipExtension = Mention.extend({
  extendNodeSchema: (extension) => (extension.name === chipName ? {leafText: chipLeafText} : {}),
})

export const fieldSchema = getSchema([...documentExtensions, chipExtension])
