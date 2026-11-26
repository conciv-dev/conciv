import {createContext, createMemo, For, useContext, type Accessor, type JSX} from 'solid-js'
import {SolidPatchDiff, type FileDiffOptions} from '@conciv/solid-diffs'
import type {ToolCallPart, ToolResultPart} from '@conciv/types/chat-message-types'
import {toolStatus, type ToolStatus} from '@conciv/ui-kit-chat/tools'
import {
  claudeBlockToUnifiedDiff,
  parseClaudePatchBlocks,
  patchInfo,
  readPatchText,
  type ApplyPatchBlock,
  type ApplyPatchInfo,
} from './apply-patch-text.js'

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
  const patchText = createMemo(() => readPatchText(props.part))
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

function Diffs(props: {options?: FileDiffOptions<undefined, undefined>; class?: string}): JSX.Element {
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
