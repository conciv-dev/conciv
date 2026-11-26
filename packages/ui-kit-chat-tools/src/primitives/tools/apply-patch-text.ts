import type {ToolCallPart} from '@conciv/types/chat-message-types'

export type ApplyPatchBlock = {type: 'Update' | 'Add' | 'Delete'; path: string; body: string}
export type ApplyPatchInfo = {files: string[]; added: number; removed: number}

export function readPatchText(part: ToolCallPart): string {
  try {
    const input = JSON.parse(part.arguments || '{}')
    const value = input.patchText ?? input.patch ?? input.input ?? input.content
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

function basename(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function patchInfo(patchText: string): ApplyPatchInfo {
  if (!patchText) return {files: [], added: 0, removed: 0}
  const files = [
    ...new Set(
      [...patchText.matchAll(/^\*\*\*[ \t]+(?:Update|Add|Delete)[ \t]+File:[ \t]+([^ \t\n\r\u2028\u2029].*)$/gm)].map(
        (match) => basename((match[1] ?? '').trim()),
      ),
    ),
  ].filter(Boolean)
  const added = patchText.split('\n').filter((line) => line.startsWith('+')).length
  const removed = patchText.split('\n').filter((line) => line.startsWith('-')).length
  return {files, added, removed}
}

export function parseClaudePatchBlocks(patchText: string): ApplyPatchBlock[] {
  const cleaned = patchText
    .replace(/^\*\*\*\s*Begin Patch\s*$/gm, '')
    .replace(/^\*\*\*\s*End Patch\s*$/gm, '')
    .trim()
  const headerRegex = /^\*\*\*[ \t]+(Update|Add|Delete)[ \t]+File:[ \t]+([^ \t\n\r\u2028\u2029].*)$/gm
  const blocks: ApplyPatchBlock[] = []
  let lastIndex = 0
  for (const match of cleaned.matchAll(headerRegex)) {
    const previous = blocks[blocks.length - 1]
    if (previous) previous.body = cleaned.slice(lastIndex, match.index)
    const type = match[1]
    if (type === 'Update' || type === 'Add' || type === 'Delete') {
      blocks.push({type, path: (match[2] ?? '').trim(), body: ''})
      lastIndex = (match.index ?? 0) + match[0].length
    }
  }
  const last = blocks[blocks.length - 1]
  if (last) last.body = cleaned.slice(lastIndex)
  return blocks
}

function filterDiffLines(body: string): string[] {
  return body
    .split('\n')
    .filter((line) => line.trim() !== '' || line.startsWith(' '))
    .filter((line) => !/^@@.*@@\s*$/.test(line))
    .filter((line) => line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))
}

export function claudeBlockToUnifiedDiff(block: ApplyPatchBlock): string {
  const {type, path} = block
  const diffLines = filterDiffLines(block.body)
  const headers = {
    Add: `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}`,
    Delete: `diff --git a/${path} b/${path}\ndeleted file mode 100644\n--- a/${path}\n+++ /dev/null`,
    Update: `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}`,
  }
  const head = headers[type]
  if (diffLines.length === 0) return head
  if (type === 'Add') {
    const lines = diffLines.map((line) => (line.startsWith('+') ? line : `+${line}`))
    return `${head}\n@@ -0,0 +1,${lines.length} @@\n${lines.join('\n')}`
  }
  if (type === 'Delete') {
    const lines = diffLines.map((line) => (line.startsWith('-') ? line : `-${line}`))
    return `${head}\n@@ -1,${lines.length} +0,0 @@\n${lines.join('\n')}`
  }
  const oldCount = diffLines.filter((line) => !line.startsWith('+')).length
  const newCount = diffLines.filter((line) => !line.startsWith('-')).length
  return `${head}\n@@ -1,${oldCount} +1,${newCount} @@\n${diffLines.join('\n')}`
}
