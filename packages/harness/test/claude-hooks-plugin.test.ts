import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {CONCIV_SESSION_HEADER, SessionId} from '@conciv/protocol/chat-types'
import {concivHooksPluginDir} from '@conciv/protocol/state-types'
import type {HarnessConnectContext, HarnessConnectFile} from '@conciv/protocol/harness-types'
import {CLAUDE_HOOK_EVENTS, claudeHooksPluginFiles} from '../src/claude/hooks-plugin.js'
import {claude} from '../src/claude/index.js'

const STATE_DIR = '/state/.conciv'
const CONCIV_SESSION = SessionId.parse('conciv_hooks_test')
const HOOK_URL = 'http://127.0.0.1:4242/api/ext/terminal/hook'

const PLUGIN_DIR = concivHooksPluginDir(STATE_DIR, CONCIV_SESSION)

const context = (over: Partial<HarnessConnectContext> = {}): HarnessConnectContext => ({
  cwd: '/workspace',
  stateDir: STATE_DIR,
  concivSessionId: CONCIV_SESSION,
  harnessSessionId: 'tok-1',
  resume: false,
  owned: true,
  model: null,
  mcpUrl: null,
  hookUrl: null,
  ...over,
})

function files(): HarnessConnectFile[] {
  return claudeHooksPluginFiles({stateDir: STATE_DIR, concivSessionId: CONCIV_SESSION, hookUrl: HOOK_URL})
}

function contentsAt(all: HarnessConnectFile[], path: string): string {
  const file = all.find((candidate) => candidate.path === path)
  if (!file) throw new Error(`no generated file at ${path}`)
  return file.contents
}

function plan(over: Partial<HarnessConnectContext> = {}) {
  const connect = claude.connect
  if (!connect) throw new Error('claude harness has no connect plan')
  return connect.plan(context(over))
}

describe('claude generated hooks plugin', () => {
  it('writes a plugin manifest and a hooks manifest under the session state dir', () => {
    const all = files()
    expect(all.map((file) => file.path)).toEqual([
      join(PLUGIN_DIR, '.claude-plugin', 'plugin.json'),
      join(PLUGIN_DIR, 'hooks', 'hooks.json'),
    ])
    expect(JSON.parse(contentsAt(all, join(PLUGIN_DIR, '.claude-plugin', 'plugin.json')))).toMatchObject({
      name: 'conciv-hooks',
      version: '0.0.0',
    })
  })

  it('subscribes every session lifecycle event to the http hook with our session header', () => {
    const parsed = JSON.parse(contentsAt(files(), join(PLUGIN_DIR, 'hooks', 'hooks.json')))
    expect(Object.keys(parsed.hooks)).toEqual([...CLAUDE_HOOK_EVENTS])
    for (const event of CLAUDE_HOOK_EVENTS) {
      expect(parsed.hooks[event][0].hooks[0]).toMatchObject({
        type: 'http',
        url: HOOK_URL,
        headers: {[CONCIV_SESSION_HEADER]: CONCIV_SESSION},
      })
    }
  })

  it('gives SessionEnd a one second budget and the rest a longer one', () => {
    const parsed = JSON.parse(contentsAt(files(), join(PLUGIN_DIR, 'hooks', 'hooks.json')))
    expect(parsed.hooks.SessionEnd[0].hooks[0].timeout).toBe(1)
    expect(parsed.hooks.Stop[0].hooks[0].timeout).toBeGreaterThan(1)
  })

  it('adds the generated plugin dir to the argv when a hook url is known', () => {
    const built = plan({hookUrl: HOOK_URL})
    expect(built.argv.slice(-2)).toEqual(['--plugin-dir', PLUGIN_DIR])
    expect(built.argv.filter((arg) => arg === '--plugin-dir')).toHaveLength(2)
    expect(built.files.map((file) => file.path)).toEqual(files().map((file) => file.path))
  })

  it('emits no generated files and a single plugin dir without a hook url', () => {
    const built = plan()
    expect(built.files).toEqual([])
    expect(built.argv.filter((arg) => arg === '--plugin-dir')).toHaveLength(1)
    expect(built.argv).not.toContain(PLUGIN_DIR)
  })
})
