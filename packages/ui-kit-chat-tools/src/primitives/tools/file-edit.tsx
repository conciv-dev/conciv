import {createContext, createMemo, useContext, type Accessor, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {parseInput} from '@conciv/ui-kit-chat'
import {toolStatus, type ToolStatus} from '@conciv/ui-kit-chat'

const EditInput = z.object({
  file_path: z.string().optional(),
  old_string: z.string().optional(),
  new_string: z.string().optional(),
  content: z.string().optional(),
})

export type FileEditDiff = {oldText: string; newText: string}

function basename(path: string | undefined): string {
  if (!path) return ''
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

function diffOf(input: z.infer<typeof EditInput> | undefined): FileEditDiff | undefined {
  if (!input) return undefined
  const oldText = input.old_string ?? ''
  const newText = input.new_string ?? input.content ?? ''
  if (!oldText && !newText) return undefined
  return {oldText, newText}
}

function lineCount(text: string): number {
  return text ? text.split('\n').length : 0
}

type FileEditContextValue = {
  part: Accessor<ToolCallPart>
  result: Accessor<ToolResultPart | undefined>
  path: Accessor<string | undefined>
  name: Accessor<string>
  verb: Accessor<string>
  diff: Accessor<FileEditDiff | undefined>
  meta: Accessor<string | undefined>
  status: Accessor<ToolStatus>
}

const FileEditContext = createContext<FileEditContextValue>()

export function useFileEdit(): FileEditContextValue {
  const context = useContext(FileEditContext)
  if (!context) throw new Error('FileEdit sub-components must be used within FileEdit.Root')
  return context
}

function Root(props: {part: ToolCallPart; result: ToolResultPart | undefined; children: JSX.Element}): JSX.Element {
  const input = createMemo(() => parseInput(EditInput, props.part))
  const path = () => input()?.file_path
  const name = () => basename(path())
  const verb = () => (props.part.name === 'Write' ? 'Wrote' : 'Edited')
  const diff = createMemo(() => diffOf(input()))
  const meta = () => {
    const value = diff()
    return value ? `+${lineCount(value.newText)} −${lineCount(value.oldText)}` : undefined
  }
  const status = createMemo(() => toolStatus(props.part, props.result))
  return (
    <FileEditContext.Provider
      value={{part: () => props.part, result: () => props.result, path, name, verb, diff, meta, status}}
    >
      {props.children}
    </FileEditContext.Provider>
  )
}

export const FileEdit = Object.assign(Root, {Root})
