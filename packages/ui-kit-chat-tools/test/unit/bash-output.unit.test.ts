import {describe, expect, it} from 'vitest'
import {parseBashOutput} from '../../src/primitives/tools/bash-output.js'

describe('reading a Bash result', () => {
  it('reads a call with no result yet as no output', () => {
    expect(parseBashOutput(undefined)).toEqual({})
  })

  it.each([
    ['the command output Claude Code sends as text', 'src\npackage.json\n'],
    ['the line Claude Code sends for a command with no output', '(Bash completed with no output)'],
  ])('reads %s as the output', (_case, content) => {
    expect(parseBashOutput({type: 'tool-result', toolCallId: 'c1', content, state: 'complete'})).toEqual({
      stdout: content,
    })
  })
})
