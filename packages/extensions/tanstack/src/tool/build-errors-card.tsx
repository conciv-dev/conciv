import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {TriangleAlert} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {CardErrorBlock, CardNote, InspectionCard} from './card-shared.js'

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

function parseErrors(props: ToolCardProps): BuildError[] | null {
  const parsed = AppErrorsSchema.safeParse(parseResultPayload(props.result))
  if (!parsed.success) return null
  return parsed.data.map((error) => ({message: error.message, where: locationOf(error.source)}))
}

function ErrorsIcon(): JSX.Element {
  return <TriangleAlert size={14} />
}

export function BuildErrorsCard(props: ToolCardProps): JSX.Element {
  const errors = () => parseErrors(props)
  const summary = () => {
    const list = errors()
    if (!list) return ''
    if (list.length === 0) return 'no errors'
    return `${list.length} ${list.length === 1 ? 'error' : 'errors'}`
  }
  return (
    <InspectionCard card={props} Icon={ErrorsIcon} summary={summary()}>
      <Show when={errors()?.length} fallback={<CardNote>No build errors</CardNote>}>
        <div class="flex flex-col gap-1.5">
          <For each={errors()}>
            {(error) => (
              <CardErrorBlock>
                <span class="[color:var(--chat-danger)] [font-family:var(--chat-mono)]">{error.message}</span>
                <Show when={error.where}>
                  {(where) => <span class="[color:var(--chat-text-3)] [font-family:var(--chat-mono)]">{where()}</span>}
                </Show>
              </CardErrorBlock>
            )}
          </For>
        </div>
      </Show>
    </InspectionCard>
  )
}
