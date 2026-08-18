import {For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import Circle from 'lucide-solid/icons/circle'
import CircleCheckBig from 'lucide-solid/icons/circle-check-big'
import CircleDashed from 'lucide-solid/icons/circle-dashed'
import ListTodo from 'lucide-solid/icons/list-todo'
import type {LucideIcon} from 'lucide-solid'
import type {ToolCardEntry, ToolCardProps, ToolRowProjection, ToolRowProps} from '@conciv/protocol/tool-view-types'
import {Todo, todoItems, useTodo, type TodoItemStatus} from '../../primitives/tools/todo.js'
import {QUIET_TEXT_CLASS, rowMarkOf, ToolCard} from '@conciv/ui-kit-chat/tools'
const STATUS_ICON: Record<TodoItemStatus, LucideIcon> = {
  pending: CircleDashed,
  in_progress: Circle,
  completed: CircleCheckBig,
}

const ROW = 'flex items-start gap-1.75 py-0.5'
const ROW_STATUS: Record<TodoItemStatus, string> = {
  pending: 'text-chat-text-2',
  in_progress: 'text-chat-text-hi',
  completed: 'text-chat-text-3 line-through',
}
const DOT = 'flex-none inline-flex items-center h-4.5'
const DOT_STATUS: Record<TodoItemStatus, string> = {
  pending: '',
  in_progress: 'text-chat-accent',
  completed: 'text-chat-success',
}

function Icon(): JSX.Element {
  return <ListTodo size={14} aria-hidden="true" />
}

function Body(): JSX.Element {
  const view = useTodo()
  return (
    <Show when={view.total()} fallback={<p class={QUIET_TEXT_CLASS}>no to-dos yet</p>}>
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
  )
}

function CardBody(props: ToolCardProps): JSX.Element {
  const view = useTodo()
  return (
    <ToolCard
      Icon={Icon}
      title="Updated the to-do list"
      meta={view.total() ? `${view.done()}/${view.total()}` : undefined}
      part={props.part}
      result={props.result}
    >
      <Body />
    </ToolCard>
  )
}

export function TodoCard(props: ToolCardProps): JSX.Element {
  return (
    <Todo.Root part={props.part} result={props.result}>
      <CardBody {...props} />
    </Todo.Root>
  )
}

export function todoRowProjection(source: ToolRowProps): ToolRowProjection {
  const todos = todoItems(source.part)
  const active = todos.find((todo) => todo.status === 'in_progress')
  const done = todos.filter((todo) => todo.status === 'completed').length
  return {
    mark: rowMarkOf(source.part, source.result),
    label: 'plan',
    target: active ? (active.activeForm ?? active.content) : 'updated the to-do list',
    meta: todos.length === 0 ? undefined : `${done}/${todos.length}`,
  }
}

export const todoTool: ToolCardEntry = {names: ['TodoWrite'], render: TodoCard, row: todoRowProjection}
