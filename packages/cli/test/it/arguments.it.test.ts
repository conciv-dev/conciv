import {describe, expect, it} from 'vitest'
import {cli} from '../utils/cli.js'

describe('mistakes', () => {
  it.each([
    {
      args: ['plugin'],
      message: 'No command given for conciv plugin.',
      hint: 'run conciv plugin --help to list its commands',
    },
    {
      args: ['plugin', 'call', 'plant-shelf', 'count', '--dta', '{}'],
      message: 'Unknown flag --dta for conciv plugin call. Did you mean --data?',
      hint: 'run conciv plugin call --help to see the arguments it accepts',
    },
    {
      args: ['auth', 'link'],
      message: 'url: missing; pass the page URL to log in, for example http://localhost:3001/',
      hint: 'run conciv auth link --help to see the arguments it accepts',
    },
    {
      args: ['mcp', 'connect', 'pi'],
      message: 'agent: pass claude, codex, gemini-cli or opencode',
      hint: 'run conciv mcp connect --help to see the arguments it accepts',
    },
    {
      args: ['mcp', 'disconnect'],
      message: 'agent: pass claude, codex, gemini-cli or opencode',
      hint: 'run conciv mcp disconnect --help to see the arguments it accepts',
    },
    {
      args: ['mcp', 'serve', '--agent', 'nope'],
      message: '--agent: pass the agent this server answers for (claude, codex, gemini-cli, opencode)',
      hint: 'run conciv mcp serve --help to see the arguments it accepts',
    },
  ])('conciv $args prints its hint and exits 1', async ({args, message, hint}) => {
    const run = await cli(args)

    expect(run.exitCode).toBe(1)
    expect(JSON.parse(run.stdout)).toEqual({ok: false, error: {kind: 'user', message, hint}})
  })
})
