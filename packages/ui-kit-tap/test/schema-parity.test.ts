import {describe, expect, test} from 'vitest'
import {Node, getSchema} from '@tiptap/core'
import {UndoRedo} from '@tiptap/extensions'
import type {Node as ProseMirrorNode} from '@tiptap/pm/model'
import {chipExtension, documentExtensions, fieldSchema} from '../src/field-schema.js'
import {buildDocument, offsetToPosition, positionToOffset, projectDocument} from '../src/lowering.js'

const editorSchema = getSchema([
  ...documentExtensions,
  UndoRedo,
  chipExtension.configure({HTMLAttributes: {'data-chip': ''}, deleteTriggerWithBackspace: true}),
])

const sample = (schema: typeof fieldSchema): ProseMirrorNode =>
  schema.node('doc', null, [
    schema.node('paragraph', null, [
      schema.text('hi '),
      schema.node('mention', {id: 'help', label: '/help', mentionSuggestionChar: '/'}),
      schema.text(' there'),
    ]),
    schema.node('paragraph'),
    schema.node('paragraph', null, [
      schema.node('mention', {id: 'ai:Opus', label: 'Opus', mentionSuggestionChar: '@'}),
      schema.text(' ok'),
    ]),
  ])

describe('lowering accepts live editor documents', () => {
  test('a document assembled from the editor schema lowers its chips to sigil plus id', () => {
    expect(projectDocument(sample(editorSchema))).toBe('hi /help there\n\n@ai:Opus ok')
  })

  test('offset mapping over a live document matches the mapping over its serialized form', () => {
    const live = sample(editorSchema)
    const serialized = live.toJSON()
    const projection = projectDocument(live)
    for (let offset = 0; offset <= projection.length; offset += 1) {
      expect(offsetToPosition(live, offset)).toBe(offsetToPosition(serialized, offset))
    }
    for (let position = 0; position <= live.content.size + 1; position += 1) {
      expect(positionToOffset(live, position)).toBe(positionToOffset(serialized, position))
    }
  })
})

describe('lowering carries no per-node knowledge', () => {
  const Stamp = Node.create({
    name: 'stamp',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes: () => ({code: {default: ''}}),
    extendNodeSchema: (extension) =>
      extension.name === 'stamp' ? {leafText: (node: ProseMirrorNode) => `[${String(node.attrs.code)}]`} : {},
  })
  const extendedSchema = getSchema([...documentExtensions, chipExtension, Stamp])
  const stamped = extendedSchema.node('doc', null, [
    extendedSchema.node('paragraph', null, [
      extendedSchema.text('go '),
      extendedSchema.node('stamp', {code: 'now'}),
      extendedSchema.text(' ok'),
    ]),
  ])

  test('a leaf node added to the schema lowers through its own spec', () => {
    expect(projectDocument(stamped)).toBe('go [now] ok')
  })

  test('a leaf node added to the schema maps offsets by its own lowered length', () => {
    expect(offsetToPosition(stamped, 3)).toBe(4)
    expect(offsetToPosition(stamped, 5)).toBe(5)
    expect(offsetToPosition(stamped, 8)).toBe(5)
    expect(offsetToPosition(stamped, 9)).toBe(6)
    expect(positionToOffset(stamped, 4)).toBe(3)
    expect(positionToOffset(stamped, 5)).toBe(8)
  })
})

describe('the field editor and the lowering engine share one schema', () => {
  test('documents built for restore parse under the editor schema without drift', () => {
    const built = editorSchema.nodeFromJSON(buildDocument('first line\n\nthird line'))
    expect(projectDocument(built)).toBe('first line\n\nthird line')
  })

  test('chips lower and size identically under both schemas', () => {
    expect(projectDocument(sample(fieldSchema))).toBe(projectDocument(sample(editorSchema)))
    expect(sample(fieldSchema).content.size).toBe(sample(editorSchema).content.size)
  })
})
