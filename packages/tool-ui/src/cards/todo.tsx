import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {ToolCard} from '../shell.js'
import {parseInput} from '../util.js'
import type {ToolCardProps} from '../types.js'

// claude TodoWrite carries todos: a checklist of {content, status, activeForm?}.
const TodoInput = z.object({
  todos: z
    .array(
      z.object({
        content: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed']),
        activeForm: z.string().optional(),
      }),
    )
    .optional(),
})

const GLYPH: Record<'pending' | 'in_progress' | 'completed', string> = {
  pending: '○',
  in_progress: '◐',
  completed: '●',
}

function TodoIcon(): JSX.Element {
  return (
    <span class="pw-tool-glyph-todo" aria-hidden="true">
      ☑
    </span>
  )
}

export function TodoCard(props: ToolCardProps): JSX.Element {
  const todos = () => parseInput(TodoInput, props.part)?.todos ?? []
  const done = () => todos().filter((t) => t.status === 'completed').length
  const meta = () => (todos().length ? `${done()}/${todos().length}` : undefined)
  return (
    <ToolCard
      accent="neutral"
      Icon={TodoIcon}
      title="Updated the to-do list"
      part={props.part}
      result={props.result}
      meta={meta()}
    >
      <Show when={todos().length}>
        <ul class="pw-todo">
          <For each={todos()}>
            {(t) => (
              <li class={`pw-todo-${t.status}`}>
                <span class="pw-todo-dot" aria-hidden="true">
                  {GLYPH[t.status]}
                </span>
                {t.status === 'in_progress' ? (t.activeForm ?? t.content) : t.content}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </ToolCard>
  )
}
