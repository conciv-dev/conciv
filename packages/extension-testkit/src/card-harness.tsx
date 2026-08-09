import {afterEach} from 'vitest'
import {render} from 'solid-js/web'
import type {Component} from 'solid-js'
import {INERT_TOOL_CATALOG, type ToolCardProps, type ToolViewCtx} from '@conciv/protocol/tool-view-types'

const defaultCtx: ToolViewCtx = {
  apiBase: '',
  harnessId: 'claude',
  sendMessage: () => {},
  addResult: () => {},
  catalog: INERT_TOOL_CATALOG,
}

const disposers: (() => void)[] = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

export function mountToolCard(
  Card: Component<ToolCardProps>,
  options: {
    name: string
    args?: unknown
    content?: string
    state?: 'complete' | 'error'
    ctx?: ToolViewCtx
    addResult?: ToolCardProps['addResult']
  },
): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const part = {
    type: 'tool-call',
    id: 't1',
    name: options.name,
    arguments: JSON.stringify(options.args ?? {}),
    state: 'input-complete',
  } as const
  const result =
    options.content === undefined
      ? undefined
      : ({
          type: 'tool-result',
          toolCallId: 't1',
          content: options.content,
          state: options.state ?? 'complete',
        } as const)
  const props: ToolCardProps = {
    part,
    result,
    ctx: options.ctx ?? defaultCtx,
    addResult: options.addResult ?? (() => {}),
  }
  disposers.push(render(() => <Card {...props} />, host))
}
