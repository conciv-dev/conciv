import {For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {z} from 'zod'
import {Circle, CircleCheckBig, CircleDashed, ListTodo, type LucideIcon} from 'lucide-solid'
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

const STATUS_ICON: Record<'pending' | 'in_progress' | 'completed', LucideIcon> = {
  pending: CircleDashed,
  in_progress: Circle,
  completed: CircleCheckBig,
}

// Row text vs dot tint differ per status (completed strikes text but the dot stays green), so two maps.
type Status = 'pending' | 'in_progress' | 'completed'
const ROW = 'flex items-start gap-1.75 py-0.5'
const ROW_STATUS: Record<Status, string> = {
  pending: 'text-pw-text-2',
  in_progress: 'text-pw-text-hi',
  completed: 'text-pw-text-3 line-through',
}
const DOT = 'flex-none inline-flex items-center h-4.5'
const DOT_STATUS: Record<Status, string> = {
  pending: '',
  in_progress: 'text-pw-accent',
  completed: 'text-pw-success',
}

function TodoIcon(): JSX.Element {
  return <ListTodo size={14} />
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
      durationMs={props.durationMs}
      meta={meta()}
    >
      <Show when={todos().length}>
        <ul class="text-[0.78125rem] m-0 p-0 list-none">
          <For each={todos()}>
            {(t) => (
              <li class={`${ROW}  ${ROW_STATUS[t.status]}`}>
                <span class={`${DOT}  ${DOT_STATUS[t.status]}`} aria-hidden="true">
                  <Dynamic component={STATUS_ICON[t.status]} size={13} />
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
