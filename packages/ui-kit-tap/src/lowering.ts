import {Fragment, Node as ProseMirrorNode, type Schema} from '@tiptap/pm/model'
import {fieldSchema} from './field-schema.js'

export type LoweringNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: LoweringNode[]
}

function resolveDocument(document: LoweringNode | ProseMirrorNode): ProseMirrorNode {
  if (document instanceof ProseMirrorNode) return document
  return fieldSchema.nodeFromJSON(document)
}

export function paragraphFragment(schema: Schema, text: string): Fragment {
  return Fragment.fromArray(
    text.split('\n').map((line) => schema.node('paragraph', null, line ? schema.text(line) : undefined)),
  )
}

export function buildDocument(text: string): LoweringNode {
  return fieldSchema.node('doc', null, paragraphFragment(fieldSchema, text)).toJSON()
}

export function projectDocument(document: LoweringNode | ProseMirrorNode): string {
  const node = resolveDocument(document)
  return node.textBetween(0, node.content.size, '\n')
}

type LoweredRun = {offset: number; length: number; position: number; end: number; isText: boolean}

function loweredLength(node: ProseMirrorNode): number {
  if (node.isText) return node.nodeSize
  return (node.type.spec.leafText?.(node) ?? '').length
}

function paragraphBreak(offset: number, paragraphPosition: number): LoweredRun {
  return {offset, length: 1, position: paragraphPosition - 1, end: paragraphPosition + 1, isText: false}
}

function inlineRun(offset: number, position: number, child: ProseMirrorNode): LoweredRun {
  return {offset, length: loweredLength(child), position, end: position + child.nodeSize, isText: child.isText}
}

function lower(document: ProseMirrorNode): LoweredRun[] {
  const runs: LoweredRun[] = []
  let offset = 0
  document.forEach((paragraph, paragraphPosition, index) => {
    if (index > 0) {
      runs.push(paragraphBreak(offset, paragraphPosition))
      offset += 1
    }
    paragraph.forEach((child, childOffset) => {
      const run = inlineRun(offset, paragraphPosition + 1 + childOffset, child)
      runs.push(run)
      offset += run.length
    })
  })
  return runs
}

function positionAt(run: LoweredRun, offset: number): number {
  if (run.isText) return run.position + (offset - run.offset)
  return offset === run.offset ? run.position : run.end
}

function offsetAt(run: LoweredRun, position: number): number {
  if (run.isText) return run.offset + Math.max(0, position - run.position)
  return position < run.end ? run.offset : run.offset + run.length
}

export function offsetToPosition(document: LoweringNode | ProseMirrorNode, offset: number): number {
  const node = resolveDocument(document)
  const clamped = Math.max(0, Math.min(offset, projectDocument(node).length))
  const run = lower(node).find((candidate) => clamped <= candidate.offset + candidate.length)
  if (!run) return node.content.size - 1
  return positionAt(run, clamped)
}

export function positionToOffset(document: LoweringNode | ProseMirrorNode, position: number): number {
  const node = resolveDocument(document)
  const run = lower(node).find((candidate) => position <= candidate.end)
  if (!run) return projectDocument(node).length
  return offsetAt(run, position)
}
