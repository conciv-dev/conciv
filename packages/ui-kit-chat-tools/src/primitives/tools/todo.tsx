import {createContext, createMemo, useContext, type Accessor, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {parseInput} from '@conciv/ui-kit-chat'
import {toolStatus, type ToolStatus} from '@conciv/ui-kit-chat'

export type TodoItemStatus = 'pending' | 'in_progress' | 'completed'
export type TodoItem = {content: string; status: TodoItemStatus; activeForm?: string}

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

type TodoContextValue = {
  todos: Accessor<TodoItem[]>
  done: Accessor<number>
  total: Accessor<number>
  status: Accessor<ToolStatus>
}

const TodoContext = createContext<TodoContextValue>()

export function useTodo(): TodoContextValue {
  const context = useContext(TodoContext)
  if (!context) throw new Error('Todo sub-components must be used within Todo.Root')
  return context
}

function Root(props: {part: ToolCallPart; result: ToolResultPart | undefined; children: JSX.Element}): JSX.Element {
  const todos = createMemo<TodoItem[]>(() => parseInput(TodoInput, props.part)?.todos ?? [])
  const done = () => todos().filter((todo) => todo.status === 'completed').length
  const total = () => todos().length
  const status = createMemo(() => toolStatus(props.part, props.result))
  return <TodoContext.Provider value={{todos, done, total, status}}>{props.children}</TodoContext.Provider>
}

export const Todo = Object.assign(Root, {Root})
