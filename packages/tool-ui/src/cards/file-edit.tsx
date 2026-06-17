import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {ToolCard} from '../shell.js'
import {parseInput} from '../util.js'
import type {ToolCardProps} from '../types.js'

// Fields we read to render a diff. Edit/MultiEdit carry old_string/new_string; Write carries
// content (a pure addition). All optional so partial/streaming input still renders a title.
const EditInput = z.object({
  file_path: z.string().optional(),
  old_string: z.string().optional(),
  new_string: z.string().optional(),
  content: z.string().optional(),
})

type DiffLine = {sign: '+' | '-'; text: string}

function diffLines(input: z.infer<typeof EditInput> | undefined): DiffLine[] {
  if (!input) return []
  const removed = input.old_string ? input.old_string.split('\n') : []
  const added = (input.new_string ?? input.content) ? (input.new_string ?? input.content ?? '').split('\n') : []
  return [
    ...removed.map((text): DiffLine => ({sign: '-', text})),
    ...added.map((text): DiffLine => ({sign: '+', text})),
  ]
}

function basename(path: string | undefined): string {
  if (!path) return ''
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

function FileEditIcon(): JSX.Element {
  return (
    <span class="pw-tool-glyph-edit" aria-hidden="true">
      ✎
    </span>
  )
}

export function FileEditCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(EditInput, props.part)
  const lines = () => diffLines(input())
  const added = () => lines().filter((l) => l.sign === '+').length
  const removed = () => lines().filter((l) => l.sign === '-').length
  const verb = () => (props.part.name === 'Write' ? 'Wrote' : 'Edited')
  const name = () => basename(input()?.file_path)
  const meta = () => (lines().length ? `+${added()} −${removed()}` : undefined)
  return (
    <ToolCard
      accent="code"
      Icon={FileEditIcon}
      title={name() ? `${verb()} ${name()}` : `${verb()} a file`}
      part={props.part}
      result={props.result}
      meta={meta()}
    >
      <Show when={lines().length} fallback={<div class="pw-tool-muted">no diff</div>}>
        <pre class="pw-diff">
          <For each={lines()}>
            {(l) => (
              <div class={l.sign === '+' ? 'pw-diff-add' : 'pw-diff-del'}>
                {l.sign} {l.text}
              </div>
            )}
          </For>
        </pre>
      </Show>
    </ToolCard>
  )
}
