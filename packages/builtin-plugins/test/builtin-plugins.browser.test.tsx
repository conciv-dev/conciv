import {describe, expect, it, onTestFinished} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {createSignal} from 'solid-js'
import {z} from 'zod'
import {createORPCClient, withEventMeta, type ClientLink} from '@orpc/client'
import type {RpcClient, RpcClientContext} from '@conciv/contract'
import {createTerminalModel, translateBuffer} from '@conciv/ui-kit-terminal'
import {rpcTerminalTransport} from '../src/terminal/terminal-transport.js'

describe('the terminal over the rpc socket', () => {
  const chunks = [
    {data: 'one', end: 3},
    {data: 'two', end: 6},
    {data: 'three', end: 11},
  ]

  async function* outputFrom(cursor: number, cutAfter: number | undefined, signal: AbortSignal | undefined) {
    for (const chunk of chunks.filter((piece) => piece.end > cursor)) {
      yield withEventMeta({type: 'output', data: chunk.data}, {id: String(chunk.end)})
      if (chunk.end === cutAfter) throw new Error('the reader fell too far behind the terminal output')
    }
    yield withEventMeta({type: 'meta', cursor: 11}, {id: '11'})
    await new Promise((resolve) => signal?.addEventListener('abort', resolve, {once: true}))
  }

  it('resumes after the last output it showed when the stream ends during the replay', async () => {
    const streams = {opened: 0}
    const PtyOutputInput = z.object({ptyId: z.string(), cursor: z.number().optional()})
    const engine: ClientLink<RpcClientContext> = {
      call: async (path, input, options) => {
        if (path.at(-1) !== 'output') return {ok: true}
        streams.opened += 1
        return outputFrom(PtyOutputInput.parse(input).cursor ?? 0, streams.opened === 1 ? 6 : undefined, options.signal)
      },
    }
    const client = createORPCClient<RpcClient>(engine)
    const model = createTerminalModel({
      transport: rpcTerminalTransport(client.experimental.persistentPty, {ptyId: 'pty_1', cursor: undefined}),
    })
    const [shown, setShown] = createSignal('')
    model.terminal.onWriteParsed(() => setShown(translateBuffer(model.terminal).trim()))
    const screen = render(() => <section aria-label="terminal shows">{shown()}</section>)
    onTestFinished(() => {
      model.disconnect()
      screen.unmount()
    })
    model.connect()
    await expect
      .element(page.getByRole('region', {name: 'terminal shows'}), {timeout: 5000})
      .toHaveTextContent('onetwothree')
    expect(translateBuffer(model.terminal).trim()).toBe('onetwothree')
  })
})
