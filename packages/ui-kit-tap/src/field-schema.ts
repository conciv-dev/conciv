import {getSchema} from '@tiptap/core'
import {Document} from '@tiptap/extension-document'
import {Paragraph} from '@tiptap/extension-paragraph'
import {Text} from '@tiptap/extension-text'
import {Mention} from '@tiptap/extension-mention'
import type {Node as ProseMirrorNode} from '@tiptap/pm/model'

const chipName = Mention.name

function chipLeafText(node: ProseMirrorNode): string {
  if (typeof node.attrs.insert === 'string') return node.attrs.insert
  return `${String(node.attrs.mentionSuggestionChar ?? '@')}${String(node.attrs.id ?? '')}`
}

export const documentExtensions = [Document, Paragraph, Text]

export const chipExtension = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      insert: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-insert'),
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.insert === 'string' ? {'data-insert': attributes.insert} : {},
      },
    }
  },
  extendNodeSchema: (extension) => (extension.name === chipName ? {leafText: chipLeafText} : {}),
})

export const fieldSchema = getSchema([...documentExtensions, chipExtension])
