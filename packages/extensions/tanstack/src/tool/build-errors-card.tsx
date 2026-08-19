import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {CardNote, ErrorRecord, InspectionCard} from './card-shared.js'

type BuildError = {message: string; where: string | null}

const AppErrorSchema = z
  .object({
    message: z.string(),
    source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullish(),
  })
  .loose()

const AppErrorsSchema = z.array(AppErrorSchema)

function locationOf(source: {file: string; line: number} | null | undefined): string | null {
  if (!source) return null
  return `${source.file}:${source.line}`
}

function parseErrors(result: ToolCardProps['result']): BuildError[] | null {
  const parsed = AppErrorsSchema.safeParse(parseResultPayload(result))
  if (!parsed.success) return null
  return parsed.data.map((error) => ({message: error.message, where: locationOf(error.source)}))
}

export function BuildErrorsCard(props: ToolCardProps): JSX.Element {
  const errors = () => parseErrors(props.result)
  const summary = () => {
    const list = errors()
    if (!list) return ''
    if (list.length === 0) return 'no errors'
    return `${list.length} ${list.length === 1 ? 'error' : 'errors'}`
  }
  const failed = () => (errors()?.length ?? 0) > 0
  return (
    <InspectionCard {...props} summary={summary()} failed={failed()}>
      <Show when={errors()?.length} fallback={<CardNote>No build errors</CardNote>}>
        <div class="flex flex-col gap-1.5">
          <For each={errors()}>
            {(error) => <ErrorRecord heading={error.where ?? undefined} body={error.message} />}
          </For>
        </div>
      </Show>
    </InspectionCard>
  )
}
