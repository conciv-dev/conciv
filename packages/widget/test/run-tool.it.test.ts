import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {z} from 'zod'
import {afterEach, expect, test} from 'vitest'
import {start, type Engine} from '@mandarax/core/engine'
import type {ExtensionServerContributions, ExtensionServerTool} from '@mandarax/extensions'
import {createRunTool} from '../src/run-tool.js'

const dirs: string[] = []
const engines: Engine[] = []

afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.stop()
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

const echo: ExtensionServerTool = {
  name: 'probe.echo',
  description: 'echo the input back',
  inputSchema: z.object({x: z.number()}),
  execute: async (input) => input,
}

const contributions: ExtensionServerContributions = {
  tools: [echo],
  systemPrompt: [],
  eventHandlers: {session_start: [], tool_execution_start: []},
  approvalPolicies: {},
}

test('runTool reaches an extension tool through the core run route and returns its result', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mx-runtool-'))
  dirs.push(root)
  const engine = await start({options: {systemPrompt: false}, root, launchEditor: () => {}, extensions: contributions})
  engines.push(engine)
  const runTool = createRunTool(`http://127.0.0.1:${engine.port}`, () => ({}))
  expect(await runTool('probe.echo', {x: 7})).toEqual({x: 7})
})
