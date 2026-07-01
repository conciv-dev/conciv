import {createContext, createMemo, useContext, type Accessor, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {parseInput, resultText, stripReadLineNumbers} from '@conciv/ui-kit-chat'
import {toolStatus, type ToolStatus} from '@conciv/ui-kit-chat'

// Headless file-read logic + structure (Read / conciv_open). The styled layer adds tokens + the
// code block. claude Read carries file_path + optional offset/limit; conciv_open carries file +
// optional line and returns no contents (it just opens the editor).
const ReadInput = z.object({
  file_path: z.string().optional(),
  file: z.string().optional(),
  offset: z.number().optional(),
  limit: z.number().optional(),
  line: z.number().optional(),
})

const MAX_LINES = 200

function lineRange(input: z.infer<typeof ReadInput>): string | undefined {
  if (input.line !== undefined) return `:${input.line}`
  if (input.offset !== undefined) {
    const end = input.limit !== undefined ? input.offset + input.limit : undefined
    return end !== undefined ? `:${input.offset}-${end}` : `:${input.offset}`
  }
  return undefined
}

// Strip claude Read's "<lineno>\t" prefix and cap the line count so a huge file can't blow the thread.
function fileContents(raw: string): string {
  if (!raw) return ''
  const lines = stripReadLineNumbers(raw).split('\n')
  return (lines.length > MAX_LINES ? lines.slice(0, MAX_LINES) : lines).join('\n')
}

type FileReadContextValue = {
  path: Accessor<string>
  verb: Accessor<string>
  range: Accessor<string | undefined>
  contents: Accessor<string>
  status: Accessor<ToolStatus>
}

const FileReadContext = createContext<FileReadContextValue>()

export function useFileRead(): FileReadContextValue {
  const context = useContext(FileReadContext)
  if (!context) throw new Error('FileRead sub-components must be used within FileRead.Root')
  return context
}

function Root(props: {part: ToolCallPart; result: ToolResultPart | undefined; children: JSX.Element}): JSX.Element {
  const input = createMemo(() => parseInput(ReadInput, props.part))
  const path = () => input()?.file_path ?? input()?.file ?? ''
  const verb = () => (props.part.name === 'conciv_open' ? 'Opened' : 'Read')
  const range = () => {
    const value = input()
    return value ? lineRange(value) : undefined
  }
  const contents = () => (props.part.name === 'conciv_open' ? '' : fileContents(resultText(props.result)))
  const status = createMemo(() => toolStatus(props.part, props.result))
  return (
    <FileReadContext.Provider value={{path, verb, range, contents, status}}>{props.children}</FileReadContext.Provider>
  )
}

export const FileRead = Object.assign(Root, {Root})
