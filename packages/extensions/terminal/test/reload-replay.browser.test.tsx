import {describe, expect, inject, it, onTestFinished} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal, onMount, type JSX} from 'solid-js'
import {createTerminalModel, translateBuffer, TerminalPrimitive, type TerminalModel} from '@conciv/ui-kit-terminal'
import {makeExtRpcClient} from '@conciv/extension'
import type {TerminalRouter} from '../src/server.js'

const LAYOUT = `
[data-terminal-root]{display:flex;flex:1;min-height:0}
[data-terminal-screen]{flex:1;min-height:0}
`

function ttyUrl(base: string, sessionId: string, cols: number, rows: number): string {
  return `${base.replace('http', 'ws')}/api/ext/terminal/tty?session=${sessionId}&cols=${cols}&rows=${rows}`
}

type Mounted = {model: TerminalModel; label: string; dispose: () => void}

type ExtClient = ReturnType<typeof makeExtRpcClient<TerminalRouter>>

function TerminalState(props: {model: TerminalModel; label: string}): JSX.Element {
  const [buffer, setBuffer] = createSignal('')
  onMount(() => {
    const {terminal} = props.model
    terminal.onWriteParsed(() => setBuffer(translateBuffer(terminal).replaceAll('\n', '')))
  })
  return (
    <section aria-label={props.label}>
      status={props.model.status()} buffer={buffer()}
    </section>
  )
}

function terminalState(label: string) {
  return page.getByRole('region', {name: label})
}

function mountTerminal(ext: ExtClient, base: string, sessionId: string, label: string): Mounted {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const shadow = host.attachShadow({mode: 'open'})
  const style = document.createElement('style')
  style.textContent = LAYOUT
  shadow.appendChild(style)
  const container = document.createElement('div')
  container.style.cssText = 'width:800px;height:400px;display:flex'
  shadow.appendChild(container)
  const model = createTerminalModel({
    url: (terminal) => ttyUrl(base, sessionId, terminal.cols, terminal.rows),
    beforeConnect: async (terminal) => {
      await ext.open({sessionId, cols: terminal.cols, rows: terminal.rows})
    },
  })
  const stateHost = document.createElement('div')
  document.body.appendChild(stateHost)
  const disposeState = render(() => <TerminalState model={model} label={label} />, stateHost)
  const dispose = render(
    () => (
      <TerminalPrimitive.Root model={model}>
        <TerminalPrimitive.Screen />
      </TerminalPrimitive.Root>
    ),
    container,
  )
  return {
    model,
    label,
    dispose: () => {
      dispose()
      disposeState()
      host.remove()
      stateHost.remove()
    },
  }
}

async function reportedSize(mounted: Mounted, marker: string): Promise<{rows: number; cols: number}> {
  mounted.model.sendInput(`echo ${marker}-$(stty size | tr ' ' 'x')\r`)
  await expect
    .element(terminalState(mounted.label), {timeout: 10_000})
    .toHaveTextContent(new RegExp(`${marker}-\\d+x\\d+`))
  const match = translateBuffer(mounted.model.terminal).match(new RegExp(`${marker}-(\\d+)x(\\d+)`))
  if (!match) throw new Error('no size report')
  return {rows: Number(match[1]), cols: Number(match[2])}
}

describe('replay after a fresh attach (reload path)', () => {
  it('replays existing scrollback into a correctly sized terminal', async () => {
    const base = inject('terminalBase')
    const sessionId = `conciv_${crypto.randomUUID()}`
    const ext = makeExtRpcClient<TerminalRouter>(base, 'terminal')

    const first = mountTerminal(ext, base, sessionId, 'first terminal')
    await expect.element(terminalState(first.label), {timeout: 10_000}).toHaveTextContent('status=open')
    await expect.element(terminalState(first.label), {timeout: 10_000}).toHaveTextContent('P>')
    const firstSize = await reportedSize(first, 'FIRSTSIZE')
    expect(firstSize.cols).toBe(first.model.terminal.cols)
    expect(firstSize.rows).toBe(first.model.terminal.rows)
    first.model.sendInput(`printf 'RULER:%0.s=' $(seq 1 60); printf 'END\\n'\r`)
    const replayMarker = `${'RULER:='.repeat(60)}END`
    await expect.element(terminalState(first.label), {timeout: 10_000}).toHaveTextContent(replayMarker)
    const firstBuffer = translateBuffer(first.model.terminal)
    const firstCols = first.model.terminal.cols
    first.dispose()

    const second = mountTerminal(ext, base, sessionId, 'second terminal')
    onTestFinished(() => second.dispose())
    await expect.element(terminalState(second.label), {timeout: 10_000}).toHaveTextContent('status=open')
    await expect.element(terminalState(second.label), {timeout: 10_000}).toHaveTextContent(replayMarker)
    const secondBuffer = translateBuffer(second.model.terminal)

    expect(second.model.terminal.cols).toBe(firstCols)
    const replayedLines = firstBuffer.split('\n').filter((line) => line.trim() !== '')
    for (const line of replayedLines) expect(secondBuffer).toContain(line)

    const secondSize = await reportedSize(second, 'SECONDSIZE')
    expect(secondSize.cols).toBe(second.model.terminal.cols)
    expect(secondSize.rows).toBe(second.model.terminal.rows)
  }, 60_000)

  it('bytes painted at spawn are sized for the client that attaches (boot restore)', async () => {
    const base = inject('terminalSpawnPaintBase')
    const sessionId = `conciv_${crypto.randomUUID()}`
    const ext = makeExtRpcClient<TerminalRouter>(base, 'terminal')

    const mounted = mountTerminal(ext, base, sessionId, 'spawn paint terminal')
    onTestFinished(() => mounted.dispose())
    await expect.element(terminalState(mounted.label), {timeout: 10_000}).toHaveTextContent(/SPAWNRULER\[=+\]/)
    const buffer = translateBuffer(mounted.model.terminal)

    const spawnCols = Number(buffer.match(/SPAWNCOLS=(\d+)/)?.[1])
    expect(spawnCols).toBe(mounted.model.terminal.cols)
    const ruler = buffer.split('\n').find((line) => line.startsWith('SPAWNRULER['))
    expect(ruler).toMatch(/^SPAWNRULER\[=+\]$/)
  }, 60_000)
})
