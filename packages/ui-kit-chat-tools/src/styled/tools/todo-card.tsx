import {For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {Circle, CircleCheckBig, CircleDashed, ListTodo, type LucideIcon} from 'lucide-solid'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Todo, useTodo, type TodoItemStatus} from '../../primitives/tools/todo.js'
import {CollapsibleCard} from '@conciv/ui-kit-chat'

const STATUS_ICON: Record<TodoItemStatus, LucideIcon> = {
  pending: CircleDashed,
  in_progress: Circle,
  completed: CircleCheckBig,
}

// Row text vs dot tint differ per status (completed strikes text but the dot stays green).
const ROW = 'flex items-start gap-1.75 py-0.5'
const ROW_STATUS: Record<TodoItemStatus, string> = {
  pending: 'text-[color:var(--chat-text-2)]',
  in_progress: 'text-[color:var(--chat-text-hi)]',
  completed: 'text-[color:var(--chat-text-3)] line-through',
}
const DOT = 'flex-none inline-flex items-center h-4.5'
const DOT_STATUS: Record<TodoItemStatus, string> = {
  pending: '',
  in_progress: 'text-[color:var(--chat-accent)]',
  completed: 'text-[color:var(--chat-success)]',
}

function Header(): JSX.Element {
  const view = useTodo()
  return (
    <>
      <ListTodo size={14} class="text-[color:var(--chat-text-3)] shrink-0" aria-hidden="true" />
      <span class="text-[color:var(--chat-text)]">Updated the to-do list</span>
      <Show when={view.total()}>
        <span class="text-[color:var(--chat-text-3)] ml-auto [font-family:var(--chat-mono)]">
          {view.done()}/{view.total()}
        </span>
      </Show>
    </>
  )
}

function Body(): JSX.Element {
  const view = useTodo()
  return (
    <CollapsibleCard header={<Header />}>
      <Show when={view.total()}>
        <ul class="text-[length:var(--chat-text-md)] m-0 p-0 list-none">
          <For each={view.todos()}>
            {(todo) => (
              <li class={`${ROW}  ${ROW_STATUS[todo.status]}`}>
                <span class={`${DOT}  ${DOT_STATUS[todo.status]}`} aria-hidden="true">
                  <Dynamic component={STATUS_ICON[todo.status]} size={13} />
                </span>
                {todo.status === 'in_progress' ? (todo.activeForm ?? todo.content) : todo.content}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </CollapsibleCard>
  )
}

// Styled to-do card: a thin --chat-* wrapper over the headless Todo primitive.
export function TodoCard(props: ToolCardProps): JSX.Element {
  return (
    <Todo.Root part={props.part} result={props.result}>
      <Body />
    </Todo.Root>
  )
}

export const todoTool: ToolCardEntry = {names: ['TodoWrite'], render: TodoCard}
