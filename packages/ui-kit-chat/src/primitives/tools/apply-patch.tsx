import {createContext, createMemo, For, useContext, type Accessor, type JSX} from 'solid-js'
import {SolidPatchDiff, type FileDiffOptions} from '@mandarax/solid-diffs'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {toolStatus, type ToolStatus} from './tool-status.js'

// Headless apply_patch logic + structure (no classes). Claude Code's apply_patch uses a "v2" envelope
// whose @@ markers are context-search strings, NOT unified-diff hunk headers; we convert each block to
// a real single-file unified diff for Pierre (ported from assistant-ui with-opencode tool-ui-apply-patch).
// The styled layer (styled/tools/apply-patch-diff) reads this context and adds tokens.

export type ApplyPatchBlock = {type: 'Update' | 'Add' | 'Delete'; path: string; body: string}
export type ApplyPatchInfo = {files: string[]; added: number; removed: number}

export function patchTextOf(part: ToolCallPart): string {
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
      [...patchText.matchAll(/^\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+)$/gm)].map((match) =>
        basename((match[1] ?? '').trim()),
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
  const headerRegex = /^\*\*\*\s+(Update|Add|Delete)\s+File:\s+(.+)$/gm
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

function diffLinesOf(body: string): string[] {
  return body
    .split('\n')
    .filter((line) => line.trim() !== '' || line.startsWith(' '))
    .filter((line) => !/^@@.*@@\s*$/.test(line))
    .filter((line) => line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))
}

export function claudeBlockToUnifiedDiff(block: ApplyPatchBlock): string {
  const {type, path} = block
  const diffLines = diffLinesOf(block.body)
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

type ApplyPatchContextValue = {
  name: Accessor<string>
  blocks: Accessor<ApplyPatchBlock[]>
  info: Accessor<ApplyPatchInfo>
  status: Accessor<ToolStatus>
  fileLabel: Accessor<string>
}

const ApplyPatchContext = createContext<ApplyPatchContextValue>()

export function useApplyPatch(): ApplyPatchContextValue {
  const context = useContext(ApplyPatchContext)
  if (!context) throw new Error('ApplyPatch sub-components must be used within ApplyPatch.Root')
  return context
}

function Root(props: {part: ToolCallPart; result: ToolResultPart | undefined; children: JSX.Element}): JSX.Element {
  const patchText = createMemo(() => patchTextOf(props.part))
  const info = createMemo(() => patchInfo(patchText()))
  const blocks = createMemo(() => parseClaudePatchBlocks(patchText()))
  const status = createMemo(() => toolStatus(props.part, props.result))
  const fileLabel = () => {
    const files = info().files
    return files.length === 1 ? (files[0] ?? '') : files.length > 1 ? `${files.length} files` : ''
  }
  return (
    <ApplyPatchContext.Provider value={{name: () => props.part.name, blocks, info, status, fileLabel}}>
      {props.children}
    </ApplyPatchContext.Provider>
  )
}

// Renders each parsed block as a Pierre unified diff (one per block sidesteps getSingularPatch's
// one-file limit). Diff theme/styling comes from the caller via `options` + `class`.
function Diffs(props: {options?: FileDiffOptions<undefined>; class?: string}): JSX.Element {
  const context = useApplyPatch()
  return (
    <For each={context.blocks()}>
      {(block) => (
        <SolidPatchDiff class={props.class} options={props.options} patch={claudeBlockToUnifiedDiff(block)} />
      )}
    </For>
  )
}

export const ApplyPatch = Object.assign(Root, {Root, Diffs})
