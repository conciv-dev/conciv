import {describe, expect, it} from 'vitest'
import type {TranscriptTailEntry} from '@conciv/contract'
import {
  ASSISTANT_MARK,
  PROMPT_MARK,
  RESULT_MARK,
  renderTranscriptTail,
  THINKING_MARK,
  TOOL_MARK,
} from '../src/composer/transcript-tail-ansi.js'

const tail: TranscriptTailEntry[] = [
  {role: 'user', text: 'rename the widget package'},
  {role: 'assistant', text: 'Looking at the manifests now.'},
  {role: 'tool', text: '', toolName: 'Read', toolResult: 'package.json read'},
]

const ESC = '\u001b'

const visible = (ansi: string): string =>
  ansi
    .split(ESC)
    .map((chunk, index) => (index === 0 ? chunk : chunk.replace(/^\[[0-9;]*m/, '')))
    .join('')

describe('the transcript preview a running session shows', () => {
  it('speaks the claude terminal vocabulary', () => {
    const lines = visible(renderTranscriptTail(tail, {working: false})).split('\r\n')

    expect(lines).toContain(`${PROMPT_MARK} rename the widget package`)
    expect(lines).toContain(`${ASSISTANT_MARK} Looking at the manifests now.`)
    expect(lines).toContain(`${TOOL_MARK} Read`)
    expect(lines).toContain(`  ${RESULT_MARK} package.json read`)
  })

  it('colours the reply white, the tool call orange and the result dim', () => {
    const ansi = renderTranscriptTail(tail, {working: false})

    expect(ansi).toContain(`\u001b[97m${ASSISTANT_MARK}`)
    expect(ansi).toContain(`\u001b[38;5;215m${TOOL_MARK}`)
    expect(ansi).toContain(`\u001b[2m  ${RESULT_MARK}`)
  })

  it('draws the prompt box under every preview', () => {
    const lines = visible(renderTranscriptTail([], {working: false})).split('\r\n')

    expect(lines.at(-3)?.startsWith('╭')).toBe(true)
    expect(lines.at(-2)?.startsWith(`│ ${PROMPT_MARK}`)).toBe(true)
    expect(lines.at(-1)?.startsWith('╰')).toBe(true)
  })

  it('adds a thinking line and a blinking cursor while the session works', () => {
    const ansi = renderTranscriptTail(tail, {working: true})

    expect(visible(ansi)).toContain(`${THINKING_MARK} Thinking…`)
    expect(ansi).toContain('\u001b[3;38;5;141m')
    expect(ansi).toContain('\u001b[5m\u001b[7m')
  })

  it('leaves the cursor and the thinking line out when the session is idle', () => {
    const ansi = renderTranscriptTail(tail, {working: false})

    expect(visible(ansi)).not.toContain('Thinking')
    expect(ansi).not.toContain('\u001b[5m')
  })

  it('keeps every line inside the preview width', () => {
    const long = 'x'.repeat(300)
    const rendered = renderTranscriptTail([{role: 'assistant', text: long}], {working: false, cols: 30})

    for (const line of visible(rendered).split('\r\n')) expect(line.length).toBeLessThanOrEqual(30)
  })
})
