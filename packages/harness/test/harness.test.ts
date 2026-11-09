import {describe, expect, it, beforeAll, afterAll, afterEach, test} from 'vitest'
import type {
  HarnessChatDeps,
  HarnessConnectContext,
  HarnessListPage,
  HarnessSessionPage,
  TranscriptHandle,
  TranscriptChunk,
  TranscriptFailure,
  TranscriptRevision,
} from '@conciv/protocol/harness-types'
import {HarnessSessionId, SessionId, CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {geminiCli} from '../src/gemini-cli/index.js'
import {initContributions} from '@conciv/harness-init/registry'
import {
  listHarnesses,
  getHarness,
  resolveHarnessModels,
  defineHarness,
  registerHarness,
  type HarnessAdapter,
} from '../src/registry.js'
import {claude} from '../src/claude/index.js'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  utimesSync,
  symlinkSync,
  appendFileSync,
  closeSync,
  openSync,
  renameSync,
  writeSync,
} from 'node:fs'
import {tmpdir, homedir} from 'node:os'
import {dirname, join} from 'node:path'
import {concivStateDir} from '@conciv/protocol/state-types'
import {claudeChatConfig, claudeExecutable} from '../src/claude/chat.js'
import {CLAUDE_ASK_RULES} from '../src/claude/ask-rules.js'
import {CHAT_SYSTEM_PROMPT} from '../src/claude/system-prompt.js'
import {
  parseHistory,
  parseSessionMeta,
  claudeHistory,
  contextTokensFromTranscript,
  withinProject,
  parseHistory as claudeParse,
  transcriptPath,
  transcriptRoot,
} from '../src/claude/history.js'
import {claudeMcpArgs, mcpServerConfig} from '../src/claude/args.js'
import {claudeSdkCommands, __commandsCacheSet} from '../src/claude/sdk.js'
import {claudeTtyCommand} from '../src/claude/tty.js'
import {codex} from '../src/codex/index.js'
import {codexDefaultModel, codexHome, codexModels} from '../src/codex/models.js'
import {mkdtemp, mkdir, open, realpath, symlink, writeFile} from 'node:fs/promises'
import {DatabaseSync} from 'node:sqlite'
import {rolloutPath, codexHistory, sessionsRoot, stateDbPath} from '../src/codex/history.js'
import {codexModels as CODEX_MODELS, makeTextAdapter} from '@conciv/ai/server'
import {z} from 'zod'
import {containedPath, transcriptPathWithin} from '../src/_shared/contained-path.js'
import {ChatEventType} from '@conciv/protocol/chat-event-types'
import {fakeText, runAdapterTurn} from '@conciv/ai/testkit'
import {lastUserModelText} from '../src/_shared/text-adapter.js'
import {opencode} from '../src/opencode/index.js'
import {storagePath, opencodeHistory} from '../src/opencode/history.js'
import {pi} from '../src/pi/index.js'
import {encodeSessionDir, sessionsDir, piHistory} from '../src/pi/history.js'
import type {ModelMessage} from '@conciv/protocol/chat-message-types'
import {execFileSync} from 'node:child_process'

const FIRST_PAGE: HarnessListPage = {after: null, limit: 30}

const PAGED_IDS = {newest: 'newest', tieHigh: 'tie-b', tieLow: 'tie-a', oldest: 'oldest'}

function blockingTranscript(path: string, mtimeSec: number): void {
  mkdirSync(join(path, '..'), {recursive: true})
  execFileSync('mkfifo', [path])
  utimesSync(path, mtimeSec, mtimeSec)
}

async function expectPagingContract(
  list: (page: HarnessListPage) => Promise<HarnessSessionPage>,
  ids: typeof PAGED_IDS,
  tieAt: number,
  unblockOldest: () => Promise<void>,
): Promise<void> {
  const first = await list({after: null, limit: 2})
  expect(first.sessions.map((session) => session.id)).toEqual([ids.newest, ids.tieHigh])
  expect(first.next).toEqual({updatedAt: tieAt, id: ids.tieHigh})
  await unblockOldest()
  const second = await list({after: first.next, limit: 2})
  expect(second.sessions.map((session) => session.id)).toEqual([ids.tieLow, ids.oldest])
  expect(second.next).toBeNull()
}

describe('acp harnesses', () => {
  const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
    cwd: '/tmp/acp-test',
    sessionId: SessionId.parse('conciv_s-1'),
    resumeSessionId: null,
    env: {},
    kind: 'chat',
    ...over,
  })

  describe('gemini-cli chatConfig', () => {
    it('returns the acp adapter named gemini-cli for the requested model', () => {
      const config = geminiCli.chatConfig(deps({model: 'gemini-2.5-flash'}))
      expect(config.adapter.model).toBe('gemini-2.5-flash')
    })

    it('threads the resume session id through modelOptions', () => {
      expect(geminiCli.chatConfig(deps()).modelOptions).toEqual({})
      expect(geminiCli.chatConfig(deps({resumeSessionId: HarnessSessionId.parse('acp-9')})).modelOptions).toEqual({
        sessionId: 'acp-9',
      })
    })
  })
})

describe('capability matrix', () => {
  const STUB_IDS = new Set(['gemini-cli'])

  describe('harness capability matrix', () => {
    for (const adapter of listHarnesses().filter((a) => !STUB_IDS.has(a.id))) {
      describe(adapter.id, () => {
        it('transcriptHistory <=> a history implementation is present', () => {
          if (adapter.capabilities.transcriptHistory) {
            expect(typeof adapter.history?.messages).toBe('function')
            expect(typeof adapter.history?.observe).toBe('function')
          } else {
            expect(adapter.history).toBeUndefined()
          }
        })

        it('declares a non-empty id, binName, and a chatConfig factory', () => {
          expect(adapter.id).toBeTruthy()
          expect(adapter.binName).toBeTruthy()
          expect(typeof adapter.chatConfig).toBe('function')
        })

        it('permissionGate is one of callback|none and systemPrompt one of file|flag|none', () => {
          expect(['callback', 'none']).toContain(adapter.capabilities.permissionGate)
          expect(['file', 'flag', 'none']).toContain(adapter.capabilities.systemPrompt)
        })

        it('init files <=> an init contribution sidecar is present', () => {
          if (adapter.capabilities.init === 'files') {
            expect(adapter.init?.harnessId).toBe(adapter.id)
            expect(typeof adapter.init?.plan).toBe('function')
            expect(typeof adapter.init?.installed).toBe('function')
          } else {
            expect(adapter.init).toBeUndefined()
          }
        })
      })
    }

    it('every registered harness declares an init contribution whose kind matches its capability', () => {
      const contributions = Object.values(initContributions)
      for (const adapter of listHarnesses()) {
        const contribution = contributions.find((one) => one.harnessId === adapter.id)
        expect(contribution, adapter.id).toBeDefined()
        expect(contribution?.init, adapter.id).toBe(adapter.capabilities.init)
        expect(contribution?.detection.bin, adapter.id).toBe(adapter.binName)
      }
    })

    it('each adapter init sidecar is the registered contribution, not a copy', () => {
      const contributionsById = new Map(Object.entries(initContributions))
      for (const adapter of listHarnesses()) {
        if (adapter.init === undefined) continue
        expect(adapter.init).toBe(contributionsById.get(adapter.id))
      }
    })

    it('every init contribution corresponds to a registered harness id', () => {
      const harnessIds = new Set(listHarnesses().map((adapter) => adapter.id))
      for (const id of Object.keys(initContributions)) {
        expect(harnessIds.has(id), id).toBe(true)
      }
    })

    it('claude exposes listSessions for the session selector', () => {
      const claude = listHarnesses().find((a) => a.id === 'claude')
      expect(typeof claude?.history?.list).toBe('function')
    })
  })
})

describe('claude adapter', () => {
  describe('claude harness adapter', () => {
    it('is a single harness on the tanstack chatConfig path', () => {
      expect(claude.id).toBe('claude')
      expect(claude.capabilities).toEqual({
        resume: true,
        permissionGate: 'callback',
        transcriptHistory: true,
        compaction: true,
        systemPrompt: 'file',
        mcp: 'http',
        slashCommands: 'live',
        imageInput: 'fileRef',
        init: 'files',
      })
      expect(typeof claude.chatConfig).toBe('function')
    })

    it('capability presence matches members (transcriptHistory ⇒ history, slashCommands ⇒ commands)', () => {
      expect(typeof claude.history?.messages).toBe('function')
      expect(typeof claude.history?.observe).toBe('function')
      expect(typeof claude.commands).toBe('function')
    })

    it('is registered and resolves models', async () => {
      expect(getHarness('claude')).toBe(claude)
      const models = await resolveHarnessModels(claude)
      expect(models.map((model) => model.id)).toContain('sonnet')
    })

    it('lists the effort levels each model supports, and a model without effort carries none', async () => {
      const models = await resolveHarnessModels(claude)
      expect(models.find((model) => model.id === 'opus')?.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
      expect(models.every((model) => model.efforts === undefined || model.efforts.length > 0)).toBe(true)
    })
  })
})

describe('claude chat config', () => {
  const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
    cwd: process.cwd(),
    sessionId: SessionId.parse('conciv_s1'),
    resumeSessionId: null,
    env: {},
    kind: 'chat',
    ...over,
  })

  describe('CHAT_SYSTEM_PROMPT', () => {
    it('points the agent at discover_tools, the tool that exists', () => {
      expect(CHAT_SYSTEM_PROMPT).toContain('`discover_tools`')
      expect(CHAT_SYSTEM_PROMPT).not.toContain('external_catalog')
    })
  })

  describe('claudeExecutable', () => {
    it('carries the bare claude binary name and --strict-mcp-config', () => {
      expect(claudeExecutable(null)).toBe('claude --strict-mcp-config')
    })

    it('adds an unquoted --plugin-dir when a plugin dir exists (the adapter argv-splits on plain spaces, not a shell)', () => {
      expect(claudeExecutable('/x/plugins')).toBe('claude --strict-mcp-config --plugin-dir /x/plugins')
    })

    it('throws when the plugin dir contains whitespace, since the adapter splits its executable string on spaces', () => {
      expect(() => claudeExecutable('/x/plug ins')).toThrow(/\/x\/plug ins/)
      expect(() => claudeExecutable('/x/plug ins')).toThrow(/whitespace/)
    })

    it('adds --settings after the plugin dir and refuses a settings path with whitespace', () => {
      expect(claudeExecutable('/x/plugins', '/t/s.json')).toBe(
        'claude --strict-mcp-config --plugin-dir /x/plugins --settings /t/s.json',
      )
      expect(() => claudeExecutable(null, '/t/my s.json')).toThrow(/whitespace/)
    })
  })

  describe('claudeChatConfig', () => {
    it('returns their claude-code adapter for the requested model', () => {
      const config = claudeChatConfig(deps({model: 'opus'}))
      expect(config.adapter.name).toBe('claude-code')
      expect(config.adapter.model).toBe('opus')
    })

    it('leaves command permissions to the auto mode of the CLI, which escalates through the approval_prompt bridge', () => {
      const config = claudeChatConfig(deps())
      expect(config.modelOptions).toMatchObject({permissionMode: 'auto'})
      expect(Reflect.get(config.adapter, 'adapterConfig')).not.toHaveProperty('permissionMode')
    })

    it('hands claude native ask rules for risky commands through a --settings file, so auto mode escalates them', () => {
      const executable: unknown = Reflect.get(
        Reflect.get(claudeChatConfig(deps()).adapter, 'adapterConfig'),
        'claudeExecutable',
      )
      const settingsPath = String(executable).split(' ').at(-1) ?? ''
      expect(String(executable).split(' ').at(-2)).toBe('--settings')
      const settings: unknown = JSON.parse(readFileSync(settingsPath, 'utf8'))
      expect(settings).toEqual({permissions: {ask: [...CLAUDE_ASK_RULES]}})
      expect(CLAUDE_ASK_RULES).toEqual(
        expect.arrayContaining([
          'Bash(git push * --force*)',
          'Bash(git * push --force*)',
          'Bash(git * push * --force*)',
          'Bash(git * reset --hard*)',
          'Bash(git * clean*)',
          'Bash(git * branch -D*)',
          'Bash(git * gc --prune*)',
          'Bash(git push * --delete*)',
          'Bash(git push * :**)',
          'Bash(git reset --hard*)',
          'Bash(git clean*)',
          'Bash(git branch -D*)',
          'Bash(git gc --prune*)',
          'Bash(rm -r*)',
          'Bash(chmod -R*)',
          'Bash(chown -R*)',
          'Bash(sudo *)',
        ]),
      )
    })

    it('disables the native AskUserQuestion, which has no channel back to the widget and self-answers as declined', () => {
      const config = claudeChatConfig(deps())
      expect(Reflect.get(config.adapter, 'adapterConfig')).toMatchObject({disallowedTools: ['AskUserQuestion']})
    })

    it('allows the bridged conciv tools so claude does not ask a second time before the conciv gate', () => {
      const config = claudeChatConfig(deps())
      expect(Reflect.get(config.adapter, 'adapterConfig')).toMatchObject({allowedTools: ['mcp__tanstack']})
    })

    it('threads the resume session id through modelOptions and leaves the workdir to the sandbox', () => {
      expect(claudeChatConfig(deps()).modelOptions).not.toHaveProperty('sessionId')
      expect(claudeChatConfig(deps({resumeSessionId: HarnessSessionId.parse('r-9')})).modelOptions).toMatchObject({
        sessionId: 'r-9',
      })
    })

    it('caps MCP tool calls above the 120s ui-ask window so blocking conciv_ui times out gracefully first', () => {
      const config = claudeChatConfig(deps())
      expect(Reflect.get(config.adapter, 'adapterConfig')).toMatchObject({env: {MCP_TOOL_TIMEOUT: '150000'}})
    })

    it('caller env wins over the MCP_TOOL_TIMEOUT default', () => {
      const config = claudeChatConfig(deps({env: {MCP_TOOL_TIMEOUT: '999000'}}))
      expect(Reflect.get(config.adapter, 'adapterConfig')).toMatchObject({env: {MCP_TOOL_TIMEOUT: '999000'}})
    })

    it('rewrites a compact turn to /compact', () => {
      const config = claudeChatConfig(deps({kind: 'compact'}))
      const prepared = config.prepareMessages?.([
        {role: 'user', content: 'earlier'},
        {role: 'assistant', content: 'reply'},
        {role: 'user', content: 'please compact'},
      ])
      expect(prepared?.at(-1)).toEqual({role: 'user', content: '/compact'})
    })

    it('writes image parts to @path fileRefs inside .conciv/tmp, never the workspace root', () => {
      const dir = mkdtempSync(join(tmpdir(), 'claude-chat-'))
      const config = claudeChatConfig(deps({cwd: dir}))
      const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      const prepared = config.prepareMessages?.([
        {
          role: 'user',
          content: [
            {type: 'text', content: 'look at this'},
            {type: 'image', source: {type: 'data', value: pixel, mimeType: 'image/png'}},
          ],
        },
      ])
      const last = prepared?.at(-1)
      const text =
        last && Array.isArray(last.content)
          ? last.content.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')
          : ''
      expect(readdirSync(dir).filter((name) => name.startsWith('.conciv-img-'))).toHaveLength(0)
      const tmpDir = join(concivStateDir(dir), 'tmp')
      const written = readdirSync(tmpDir).filter((name) => name.startsWith('img-'))
      expect(written).toHaveLength(1)
      expect(text).toContain(`@${join(tmpDir, written[0] ?? '')}`)
      expect(readFileSync(join(tmpDir, written[0] ?? '')).toString('base64')).toBe(pixel)
    })
  })
})

describe('claude terminal command', () => {
  const CONCIV_SESSION = SessionId.parse('conciv_plan_test')

  const context = (over: Partial<HarnessConnectContext> = {}): HarnessConnectContext => ({
    cwd: '/workspace',
    stateDir: '/state/.conciv',
    concivSessionId: CONCIV_SESSION,
    harnessSessionId: HarnessSessionId.parse('tok-1'),
    resume: false,
    owned: true,
    model: null,
    mcpUrl: null,
    hookUrl: null,
    ...over,
  })

  function plan(over: Partial<HarnessConnectContext> = {}): string[] {
    const command = claude.tty?.command(context(over))
    if (!command) throw new Error('claude harness has no terminal command')
    return [command.bin, ...command.args]
  }

  function mcpConfigOf(argv: string[]): unknown {
    const raw = argv[argv.indexOf('--mcp-config') + 1]
    if (!raw) throw new Error('plan has no --mcp-config payload')
    return JSON.parse(raw)
  }

  describe('claude tty.command', () => {
    it('resumes an existing harness session and carries the conciv session header into the mcp config', () => {
      const argv = plan({resume: true, mcpUrl: 'http://127.0.0.1:1/api/mcp'})
      expect(argv.slice(0, 3)).toEqual(['claude', '--resume', 'tok-1'])
      expect(argv).toContain('--strict-mcp-config')
      expect(mcpConfigOf(argv)).toEqual({
        mcpServers: {
          conciv: {
            type: 'http',
            url: 'http://127.0.0.1:1/api/mcp',
            headers: {[CONCIV_SESSION_HEADER]: CONCIV_SESSION},
          },
        },
      })
    })

    it('pins a fresh harness session id when there is nothing to resume', () => {
      expect(plan().slice(0, 3)).toEqual(['claude', '--session-id', 'tok-1'])
    })

    it('omits the session flags entirely when no harness session id is known', () => {
      expect(plan({harnessSessionId: null})).toEqual(['claude'])
    })

    it('omits the mcp args when there is no mcp url', () => {
      const argv = plan()
      expect(argv).not.toContain('--mcp-config')
      expect(argv).not.toContain('--strict-mcp-config')
    })

    it('passes the model through', () => {
      expect(plan({model: 'opus'})).toEqual(['claude', '--session-id', 'tok-1', '--model', 'opus'])
    })
  })
})

describe('claude history', () => {
  const CLAUDE_IDS = {
    older: '00000000-0000-4000-8000-00000000000a',
    newer: '00000000-0000-4000-8000-00000000000b',
    hidden: '00000000-0000-4000-8000-00000000000c',
  }
  const CLAUDE_PAGED_IDS = {
    newest: '00000000-0000-4000-8000-000000000001',
    tieHigh: '00000000-0000-4000-8000-000000000003',
    tieLow: '00000000-0000-4000-8000-000000000002',
    oldest: '00000000-0000-4000-8000-000000000000',
  }

  function seed(cwd: string, id: string, body: string, mtimeSec: number) {
    const path = transcriptPath(cwd, id)
    mkdirSync(join(path, '..'), {recursive: true})
    writeFileSync(path, body)
    utimesSync(path, mtimeSec, mtimeSec)
  }

  describe('parseHistory', () => {
    it('keeps user messages whose content is a plain string', () => {
      const jsonl = [
        JSON.stringify({type: 'user', message: {role: 'user', content: 'what else can you do?'}}),
        JSON.stringify({
          type: 'assistant',
          message: {role: 'assistant', content: [{type: 'text', text: 'Lots of things.'}]},
        }),
      ].join('\n')

      const msgs = parseHistory(jsonl)
      const roles = msgs.map((m) => m.role)
      expect(roles).toContain('user')
      expect(roles).toContain('assistant')

      const user = msgs.find((m) => m.role === 'user')
      expect(user?.parts).toContainEqual({type: 'text', content: 'what else can you do?'})
    })

    it('merges consecutive assistant records that share a message.id', () => {
      const jsonl = [
        JSON.stringify({type: 'user', message: {role: 'user', content: "what's on the page now?"}}),
        JSON.stringify({
          type: 'assistant',
          message: {id: 'msg_A', role: 'assistant', content: [{type: 'thinking', thinking: 'Let me take a snapshot.'}]},
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            id: 'msg_A',
            role: 'assistant',
            content: [{type: 'tool_use', id: 'toolu_1', name: 'mcp__conciv__page_snapshot', input: {verb: 'snapshot'}}],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {role: 'user', content: [{type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok'}]},
        }),
        JSON.stringify({
          type: 'assistant',
          message: {id: 'msg_B', role: 'assistant', content: [{type: 'text', text: 'Same as before.'}]},
        }),
      ].join('\n')

      const msgs = parseHistory(jsonl)
      const assistants = msgs.filter((m) => m.role === 'assistant')
      expect(assistants).toHaveLength(2)
      expect(assistants[0]?.parts.map((p) => p.type)).toEqual(['thinking', 'tool-call', 'tool-result'])
      expect(assistants[1]?.parts.map((p) => p.type)).toEqual(['text'])
    })

    it('strips the plugin-scoped conciv namespace adopted sessions use', () => {
      const jsonl = JSON.stringify({
        type: 'assistant',
        message: {
          id: 'msg_C',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_2',
              name: 'mcp__plugin_conciv-connect_conciv__page_snapshot',
              input: {verb: 'snapshot'},
            },
          ],
        },
      })

      const call = parseHistory(jsonl)[0]?.parts[0]
      expect(call).toMatchObject({type: 'tool-call', name: 'page_snapshot'})
    })

    it('leaves other plugin servers fully qualified', () => {
      const jsonl = JSON.stringify({
        type: 'assistant',
        message: {
          id: 'msg_D',
          role: 'assistant',
          content: [{type: 'tool_use', id: 'toolu_3', name: 'mcp__plugin_context7_context7__query-docs', input: {}}],
        },
      })

      const call = parseHistory(jsonl)[0]?.parts[0]
      expect(call).toMatchObject({type: 'tool-call', name: 'mcp__plugin_context7_context7__query-docs'})
    })
  })

  const taskNotification = JSON.stringify({
    type: 'user',
    origin: {kind: 'task-notification'},
    message: {role: 'user', content: 'Background task 3fa1 completed'},
  })
  const interrupted = JSON.stringify({
    type: 'user',
    message: {role: 'user', content: '[Request interrupted by user]'},
  })
  const interruptedForToolUse = JSON.stringify({
    type: 'user',
    interruptedMessageId: 'msg_interrupted',
    message: {role: 'user', content: '[Request interrupted by user for tool use]'},
  })
  const noResponseRequested = JSON.stringify({
    type: 'user',
    message: {role: 'user', content: 'No response requested.'},
  })
  const metaSkillBody = JSON.stringify({
    type: 'user',
    isMeta: true,
    message: {role: 'user', content: 'You are running the octocat skill. Follow SKILL.md exactly.'},
  })
  const metaImageRef = JSON.stringify({
    type: 'user',
    isMeta: true,
    message: {role: 'user', content: [{type: 'text', text: '[Image #1]'}]},
  })
  const metaLocalCommandCaveat = JSON.stringify({
    type: 'user',
    isMeta: true,
    message: {
      role: 'user',
      content: 'Caveat: The messages below were generated by the user while running local commands.',
    },
  })
  const compactSummary = JSON.stringify({
    type: 'user',
    isCompactSummary: true,
    message: {role: 'user', content: 'This session is being continued from a previous conversation.'},
  })
  const slashCommandMarker = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content:
        '<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>',
    },
  })
  const machineryLines = [
    taskNotification,
    interrupted,
    interruptedForToolUse,
    noResponseRequested,
    metaSkillBody,
    metaImageRef,
    metaLocalCommandCaveat,
    compactSummary,
    slashCommandMarker,
  ]

  describe('parseHistory machinery filtering', () => {
    it('drops every claude machinery record instead of rendering it as a user turn', () => {
      expect(parseHistory(machineryLines.join('\n'))).toEqual([])
    })

    it('keeps genuine typed, queued-with-image, and SDK-style (no origin) user messages', () => {
      const jsonl = [
        JSON.stringify({type: 'user', origin: {kind: 'human'}, message: {role: 'user', content: 'fix the header'}}),
        JSON.stringify({
          type: 'user',
          origin: {kind: 'human'},
          message: {
            role: 'user',
            content: [
              {type: 'image', source: {type: 'base64', media_type: 'image/png', data: 'iVBOR'}},
              {type: 'text', text: 'match this mock'},
            ],
          },
        }),
        JSON.stringify({type: 'user', message: {role: 'user', content: 'and ship it'}}),
      ].join('\n')

      const msgs = parseHistory(jsonl)
      expect(msgs.map((m) => m.role)).toEqual(['user', 'user', 'user'])
      expect(msgs.flatMap((m) => m.parts)).toEqual([
        {type: 'text', content: 'fix the header'},
        {type: 'text', content: 'match this mock'},
        {type: 'text', content: 'and ship it'},
      ])
    })

    it('keeps prose that mentions capitalised markup', () => {
      const jsonl = JSON.stringify({type: 'user', message: {role: 'user', content: '<Button>Save</Button>'}})
      expect(parseHistory(jsonl)[0]?.parts).toEqual([{type: 'text', content: '<Button>Save</Button>'}])
    })

    it('still attaches tool results carried by machinery-adjacent user records', () => {
      const jsonl = [
        JSON.stringify({
          type: 'assistant',
          message: {
            id: 'msg_T',
            role: 'assistant',
            content: [{type: 'tool_use', id: 'toolu_9', name: 'Read', input: {}}],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {role: 'user', content: [{type: 'tool_result', tool_use_id: 'toolu_9', content: 'file body'}]},
        }),
        interrupted,
      ].join('\n')

      const msgs = parseHistory(jsonl)
      expect(msgs).toHaveLength(1)
      expect(msgs[0]?.parts.map((p) => p.type)).toEqual(['tool-call', 'tool-result'])
    })
  })

  describe('parseSessionMeta machinery filtering', () => {
    it('derives the title from the first genuine user message', () => {
      const jsonl = [
        ...machineryLines,
        JSON.stringify({type: 'user', message: {role: 'user', content: 'rename the settings panel'}}),
        JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'done'}]}}),
      ].join('\n')
      expect(parseSessionMeta('s', '/proj', jsonl, 1).derivedTitle).toBe('rename the settings panel')
    })

    it('counts only genuine turns and never previews machinery', () => {
      const jsonl = [
        JSON.stringify({type: 'user', message: {role: 'user', content: 'rename the settings panel'}}),
        JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'done'}]}}),
        ...machineryLines,
      ].join('\n')
      const meta = parseSessionMeta('s', '/proj', jsonl, 1)
      expect(meta.lastMessage).toBe('done')
    })
  })

  describe('contextTokensFromTranscript', () => {
    const assistant = (usage: Record<string, number>, extra: Record<string, unknown> = {}) =>
      JSON.stringify({
        type: 'assistant',
        message: {role: 'assistant', content: [{type: 'text', text: 'ok'}], usage},
        ...extra,
      })

    it('reports the LAST request occupancy, never the cumulative turn sum', () => {
      const jsonl = [
        assistant({input_tokens: 4, cache_creation_input_tokens: 900, cache_read_input_tokens: 89000}),
        JSON.stringify({type: 'user', message: {role: 'user', content: [{type: 'tool_result', tool_use_id: 't1'}]}}),
        assistant({input_tokens: 2, cache_creation_input_tokens: 750, cache_read_input_tokens: 92000}),
      ].join('\n')
      expect(contextTokensFromTranscript(jsonl)).toBe(2 + 750 + 92000)
    })

    it('ignores sub-agent (sidechain) records', () => {
      const jsonl = [
        assistant({input_tokens: 2, cache_creation_input_tokens: 750, cache_read_input_tokens: 92000}),
        assistant({input_tokens: 5, cache_read_input_tokens: 500000}, {isSidechain: true}),
      ].join('\n')
      expect(contextTokensFromTranscript(jsonl)).toBe(2 + 750 + 92000)
    })

    it('returns undefined when no assistant usage is present', () => {
      const jsonl = JSON.stringify({type: 'user', message: {role: 'user', content: 'hi'}})
      expect(contextTokensFromTranscript(jsonl)).toBeUndefined()
    })

    it('is wired onto claudeHistory', () => {
      expect(claudeHistory.contextTokens).toBe(contextTokensFromTranscript)
    })
  })

  describe('claudeHistory.nameFromTranscript', () => {
    it('returns the last summary record', () => {
      const jsonl = [
        JSON.stringify({type: 'summary', summary: 'First guess'}),
        JSON.stringify({type: 'user', message: {content: 'hi'}}),
        JSON.stringify({type: 'summary', summary: 'Fix the checkout layout bug'}),
      ].join('\n')
      expect(claudeHistory.nameFromTranscript?.(jsonl)).toBe('Fix the checkout layout bug')
    })

    it('returns null when there is no summary', () => {
      const jsonl = JSON.stringify({type: 'user', message: {content: 'hi'}})
      expect(claudeHistory.nameFromTranscript?.(jsonl)).toBeNull()
    })
  })

  describe('listSessions', () => {
    it('lists newest first under the Claude config dir, titled and sized the way Claude shows them', async () => {
      const cwd = '/proj/x'
      const newer = [
        JSON.stringify({type: 'user', message: {content: 'newer task'}}),
        JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'ok'}]}}),
      ].join('\n')
      seed(cwd, CLAUDE_IDS.older, JSON.stringify({type: 'user', message: {content: 'first task'}}) + '\n', 1000)
      seed(cwd, CLAUDE_IDS.newer, newer + '\n', 2000)
      seed(cwd, CLAUDE_IDS.hidden, JSON.stringify({type: 'assistant', message: {content: []}}) + '\n', 3000)
      const out = (await claudeHistory.list({cwd}, FIRST_PAGE)).sessions
      expect(out).toEqual([
        expect.objectContaining({
          id: CLAUDE_IDS.newer,
          derivedTitle: 'newer task',
          updatedAt: 2_000_000,
          sizeBytes: Buffer.byteLength(newer + '\n'),
        }),
        expect.objectContaining({id: CLAUDE_IDS.older, derivedTitle: 'first task', updatedAt: 1_000_000}),
      ])
      expect(await claudeHistory.meta(cwd, HarnessSessionId.parse(CLAUDE_IDS.newer))).toEqual(out[0])
      expect(await claudeHistory.meta(cwd, HarnessSessionId.parse(CLAUDE_IDS.hidden))).toBeNull()
      rmSync(transcriptRoot(cwd), {recursive: true, force: true})
    })

    it('lists the sessions of every project, each with the cwd its transcript records', async () => {
      const projects = {
        first: {cwd: '/proj/every-first', id: '00000000-0000-4000-8000-0000000000e1'},
        second: {cwd: '/proj/every/second', id: '00000000-0000-4000-8000-0000000000e2'},
      }
      for (const project of Object.values(projects)) {
        seed(
          project.cwd,
          project.id,
          JSON.stringify({type: 'user', cwd: project.cwd, message: {content: 'task'}}) + '\n',
          4000,
        )
      }
      const {sessions} = await claudeHistory.list({everywhere: true}, FIRST_PAGE)
      expect(sessions.map(({id, cwd}) => ({id, cwd}))).toEqual(expect.arrayContaining(Object.values(projects)))
      for (const project of Object.values(projects)) rmSync(transcriptRoot(project.cwd), {recursive: true, force: true})
    })

    it('pages newest first and breaks updatedAt ties by id', async () => {
      const cwd = '/proj/paged'
      const body = JSON.stringify({type: 'user', message: {content: 'paged task'}}) + '\n'
      seed(cwd, CLAUDE_PAGED_IDS.newest, body, 3000)
      seed(cwd, CLAUDE_PAGED_IDS.tieHigh, body, 2000)
      seed(cwd, CLAUDE_PAGED_IDS.tieLow, body, 2000)
      seed(cwd, CLAUDE_PAGED_IDS.oldest, body, 1000)
      await expectPagingContract(
        (page) => claudeHistory.list({cwd}, page),
        CLAUDE_PAGED_IDS,
        2_000_000,
        async () => {},
      )
      rmSync(transcriptRoot(cwd), {recursive: true, force: true})
    })

    it('returns [] for a missing dir', async () => {
      expect(await claudeHistory.list({cwd: '/no/such'}, FIRST_PAGE)).toEqual({sessions: [], next: null})
    })
  })

  describe('messages stops reading when its caller aborts', () => {
    it('rejects with an AbortError instead of folding the whole transcript', async () => {
      const cwd = '/proj/abort'
      const id = '00000000-0000-4000-8000-0000000000ab'
      const filler = 'x'.repeat(400)
      const line = (index: number) =>
        index % 2 === 0
          ? JSON.stringify({type: 'user', message: {content: `question ${index} ${filler}`}})
          : JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: `answer ${index} ${filler}`}]}})
      seed(cwd, id, Array.from({length: 40_000}, (_, index) => line(index)).join('\n') + '\n', 5000)
      const sessionId = HarnessSessionId.parse(id)
      const controller = new AbortController()
      const aborted = claudeHistory.messages(cwd, sessionId, {signal: controller.signal})
      setTimeout(() => controller.abort(), 0)
      await expect(aborted).rejects.toMatchObject({name: 'AbortError'})
      rmSync(transcriptRoot(cwd), {recursive: true, force: true})
    })
  })

  describe('withinProject', () => {
    it('rejects traversal and accepts a normal id', () => {
      expect(withinProject('/proj', '../../etc/passwd')).toBe(false)
      expect(withinProject('/proj', '0c1d2e3f-aaaa-bbbb-cccc-000011112222')).toBe(true)
    })
  })

  describe('parseSessionMeta', () => {
    it('extracts model + token totals + last message from a transcript', () => {
      const jsonl = [
        JSON.stringify({type: 'system', session_id: 'tok', model: 'claude-opus-4-8'}),
        JSON.stringify({type: 'user', message: {content: 'hi there'}}),
        JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'the reply'}]}}),
        JSON.stringify({type: 'result', usage: {input_tokens: 10, output_tokens: 5}}),
      ].join('\n')
      const meta = parseSessionMeta('tok', '/proj', jsonl, 123)
      expect(meta.model).toBe('claude-opus-4-8')
      expect(meta.updatedAt).toBe(123)
      expect(meta.totalTokens).toBe(15)
      expect(meta.lastMessage).toBe('the reply')
    })
  })
})

describe('claude mcp session', () => {
  describe('claude MCP server config carries the session (launch path)', () => {
    it('puts the conciv session header on the http server when a session is given', () => {
      const cfg = mcpServerConfig('http://x/api/mcp', 'conciv_abc')
      expect(cfg.conciv.headers?.[CONCIV_SESSION_HEADER]).toBe('conciv_abc')
    })

    it('omits headers when no session is given (interactive launch has no live room)', () => {
      const cfg = mcpServerConfig('http://x/api/mcp')
      expect(cfg.conciv.headers).toBeUndefined()
    })

    it('claudeMcpArgs without a session emits a header-less config with --strict-mcp-config', () => {
      const args = claudeMcpArgs('http://x/api/mcp')
      const cfg = JSON.parse(args[1] ?? '{}')
      expect(cfg.mcpServers.conciv.headers).toBeUndefined()
      expect(args).toContain('--strict-mcp-config')
    })

    it('does not blanket-allow conciv MCP tools so the gate fires', () => {
      expect(claudeMcpArgs('http://x/api/mcp')).not.toContain('--allowedTools')
    })
  })
})

describe('claude sdk commands', () => {
  describe('claudeSdkCommands', () => {
    it('serves the per-cwd cache without probing', async () => {
      __commandsCacheSet('/tmp/fake-project', [{name: 'compact', description: 'Compact the context'}])
      const commands = await claudeSdkCommands({cwd: '/tmp/fake-project', sessionId: SessionId.parse('conciv_s1')})
      expect(commands).toEqual([{name: 'compact', description: 'Compact the context'}])
    })
  })
})

describe('claude tty', () => {
  const context = (over: Partial<HarnessConnectContext> = {}): HarnessConnectContext => ({
    cwd: '/tmp/p',
    stateDir: '/state/.conciv',
    concivSessionId: SessionId.parse('conciv_tty_test'),
    harnessSessionId: HarnessSessionId.parse('abc-123'),
    resume: false,
    owned: true,
    model: null,
    mcpUrl: null,
    hookUrl: null,
    ...over,
  })

  describe('claudeTtyCommand', () => {
    it('resumes an existing session', () => {
      const cmd = claudeTtyCommand(context({resume: true}))
      expect(cmd.bin).toBe('claude')
      expect(cmd.args).toEqual(['--resume', 'abc-123'])
      expect(cmd.env.TERM).toBe('xterm-256color')
    })

    it('strips nested claude session markers so transcripts persist', () => {
      const cmd = claudeTtyCommand(context())
      expect(cmd.unsetEnvPrefixes).toContain('CLAUDECODE')
      expect(cmd.unsetEnvPrefixes).toContain('CLAUDE_CODE_')
    })

    it('pins the session id for a fresh session', () => {
      expect(claudeTtyCommand(context()).args).toEqual(['--session-id', 'abc-123'])
    })

    it('passes the model through', () => {
      const cmd = claudeTtyCommand(context({resume: true, model: 'opus'}))
      expect(cmd.args).toEqual(['--resume', 'abc-123', '--model', 'opus'])
    })

    it('appends conciv mcp args when mcpUrl provided', () => {
      const cmd = claudeTtyCommand(
        context({harnessSessionId: HarnessSessionId.parse('tok-1'), mcpUrl: 'http://localhost:4111/api/mcp'}),
      )
      const joined = cmd.args.join(' ')
      expect(joined).toContain('--mcp-config')
      expect(joined).toContain('--strict-mcp-config')
      expect(joined).toContain('http://localhost:4111/api/mcp')
      expect(joined).toContain('conciv_tty_test')
    })

    it('omits mcp args without mcpUrl', () => {
      expect(
        claudeTtyCommand(context({harnessSessionId: HarnessSessionId.parse('tok-1'), resume: true})).args.join(' '),
      ).not.toContain('--mcp-config')
    })
  })
})

describe('codex chat config', () => {
  const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
    cwd: '/tmp/codex-test',
    sessionId: SessionId.parse('conciv_s-1'),
    resumeSessionId: null,
    env: {PATH: '/usr/bin'},
    kind: 'chat',
    ...over,
  })

  describe('codex chatConfig', () => {
    it('returns their codex adapter for the requested model', () => {
      const config = codex.chatConfig(deps({model: 'gpt-5.1'}))
      expect(config.adapter.name).toBe('codex')
      expect(config.adapter.model).toBe('gpt-5.1')
    })

    it('defaults to the model codex itself would choose when none is requested', () => {
      expect(codex.chatConfig(deps()).adapter.model).toBe(codexDefaultModel(codexHome(deps().env)))
    })

    it('defaults to the model named in the CODEX_HOME the session env points at', () => {
      const dir = mkdtempSync(join(tmpdir(), 'codex-chat-config-'))
      writeFileSync(join(dir, 'config.toml'), 'model = "gpt-from-env-home"\n')
      expect(codex.chatConfig(deps({env: {PATH: '/usr/bin', CODEX_HOME: dir}})).adapter.model).toBe('gpt-from-env-home')
    })

    it('threads the resume session id through modelOptions and leaves the workdir to the sandbox', () => {
      expect(codex.chatConfig(deps()).modelOptions).toEqual({})
      expect(codex.chatConfig(deps({resumeSessionId: HarnessSessionId.parse('thread-9')})).modelOptions).toEqual({
        sessionId: 'thread-9',
      })
    })

    it('auto-approves the bridged MCP server only when tools ride the run', () => {
      const bridged = JSON.stringify(codex.chatConfig(deps({hasTools: true})).adapter)
      expect(bridged).toContain('mcp_servers.tanstack.default_tools_approval_mode')
      const bare = JSON.stringify(codex.chatConfig(deps()).adapter)
      expect(bare).not.toContain('mcp_servers.tanstack')
    })
  })
})

describe('codex history', () => {
  const PROJECT = '/workspace/demo'
  const OTHER = '/workspace/other'
  const SESSION = HarnessSessionId.parse('019fb331-4da4-7960-8197-c43d6205c10b')
  const STRAY = HarnessSessionId.parse('019fb328-153e-7da1-8d38-36286c97d0ab')
  const DELETED = HarnessSessionId.parse('019fb320-0000-7000-8000-00000000de1e')

  const ROLLOUT_LINES = [
    {
      timestamp: '2026-07-30T13:23:05.125Z',
      type: 'session_meta',
      payload: {session_id: SESSION, id: SESSION, cwd: PROJECT, originator: 'codex_exec', cli_version: '0.145.0'},
    },
    {timestamp: '2026-07-30T13:23:05.200Z', type: 'turn_context', payload: {cwd: PROJECT, model: 'gpt-5.5'}},
    {
      timestamp: '2026-07-30T13:23:06.744Z',
      type: 'event_msg',
      payload: {type: 'user_message', message: 'list the files', images: [], text_elements: []},
    },
    {
      timestamp: '2026-07-30T13:23:07.100Z',
      type: 'response_item',
      payload: {
        type: 'function_call',
        id: 'fc_1',
        name: 'search',
        namespace: 'conciv',
        arguments: '{"query":"files"}',
        call_id: 'call_1',
      },
    },
    {
      timestamp: '2026-07-30T13:23:07.400Z',
      type: 'response_item',
      payload: {type: 'function_call_output', call_id: 'call_1', output: 'README.md\npackage.json'},
    },
    {
      timestamp: '2026-07-30T13:23:07.500Z',
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        id: 'ctc_1',
        name: 'apply_patch',
        input: '*** Begin Patch',
        call_id: 'call_2',
      },
    },
    {
      timestamp: '2026-07-30T13:23:07.600Z',
      type: 'response_item',
      payload: {type: 'custom_tool_call_output', call_id: 'call_2', output: 'Exit code: 0'},
    },
    {
      timestamp: '2026-07-30T13:23:07.982Z',
      type: 'event_msg',
      payload: {type: 'agent_message', message: 'Two files.', phase: 'final_answer'},
    },
    {
      timestamp: '2026-07-30T13:23:08.039Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {input_tokens: 15989, cached_input_tokens: 9600, output_tokens: 5, total_tokens: 15994},
          model_context_window: 258400,
        },
      },
    },
  ]

  const rollout = (lines: unknown[]): string => `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`

  async function seedRollout(name: string, lines: unknown[]): Promise<string> {
    const dir = join(sessionsRoot(), '2026', '07', '30')
    await mkdir(dir, {recursive: true})
    const path = join(dir, name)
    await writeFile(path, rollout(lines), 'utf8')
    return path
  }

  function seedThreads(rows: {id: string; path: string; cwd: string; archived?: number; updated: number}[]): void {
    const db = new DatabaseSync(stateDbPath())
    db.exec(
      `create table if not exists threads (id text primary key, rollout_path text not null, cwd text not null, title text not null default '', first_user_message text not null default '', preview text not null default '', model text, tokens_used integer not null default 0, archived integer not null default 0, created_at integer not null, updated_at integer not null, created_at_ms integer, updated_at_ms integer)`,
    )
    const insert = db.prepare(
      'insert or replace into threads (id, rollout_path, cwd, title, first_user_message, preview, model, tokens_used, archived, created_at, updated_at, created_at_ms, updated_at_ms) values (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    for (const row of rows) {
      insert.run(
        row.id,
        row.path,
        row.cwd,
        'List the files',
        'list the files',
        'Two files.',
        'gpt-5.5',
        32017,
        row.archived ?? 0,
        Math.round(row.updated / 1000) - 20,
        Math.round(row.updated / 1000),
        row.updated - 20_000,
        row.updated,
      )
    }
    db.close()
  }

  beforeAll(async () => {
    await mkdir(sessionsRoot(), {recursive: true})
    const main = await seedRollout(`rollout-2026-07-30T16-23-00-${SESSION}.jsonl`, ROLLOUT_LINES)
    const stray = await seedRollout(
      `rollout-2026-07-30T16-12-56-${STRAY}.jsonl`,
      ROLLOUT_LINES.map((line) =>
        line.type === 'session_meta' ? {...line, payload: {...line.payload, cwd: OTHER}} : line,
      ),
    )
    seedThreads([
      {id: SESSION, path: main, cwd: PROJECT, updated: 1785417797467},
      {id: STRAY, path: stray, cwd: OTHER, updated: 1785417209607},
      {id: DELETED, path: join(sessionsRoot(), 'deleted.jsonl'), cwd: PROJECT, updated: 1785417000000},
    ])
  })

  const history = () => {
    const found = codex.history
    if (!found) throw new Error('codex harness has no history')
    return found
  }

  describe('codex rollout parsing', () => {
    it('builds a user/assistant spine with tool calls and their outputs', async () => {
      expect(await history().messages(PROJECT, SESSION)).toEqual([
        {id: `${SESSION}:h1`, role: 'user', parts: [{type: 'text', content: 'list the files'}]},
        {
          id: `${SESSION}:h2`,
          role: 'assistant',
          parts: [
            {
              type: 'tool-call',
              id: 'call_1',
              name: 'conciv__search',
              arguments: '{"query":"files"}',
              state: 'input-complete',
            },
            {type: 'tool-result', toolCallId: 'call_1', content: 'README.md\npackage.json', state: 'complete'},
            {
              type: 'tool-call',
              id: 'call_2',
              name: 'apply_patch',
              arguments: JSON.stringify({input: '*** Begin Patch'}),
              state: 'input-complete',
            },
            {type: 'tool-result', toolCallId: 'call_2', content: 'Exit code: 0', state: 'complete'},
            {type: 'text', content: 'Two files.'},
          ],
        },
      ])
    })

    it('gives two codex sessions of one project disjoint message ids', async () => {
      const second = HarnessSessionId.parse('019fb340-0000-7000-8000-000000000002')
      await seedRollout(
        `rollout-2026-07-30T17-00-00-${second}.jsonl`,
        ROLLOUT_LINES.map((line) =>
          line.type === 'session_meta' ? {...line, payload: {...line.payload, session_id: second, id: second}} : line,
        ),
      )
      const first = await history().messages(PROJECT, SESSION)
      const next = await history().messages(PROJECT, second)
      expect(next.map((message) => message.role)).toEqual(['user', 'assistant'])
      const firstIds = new Set(first.map((message) => message.id))
      expect(next.filter((message) => firstIds.has(message.id))).toEqual([])
    })

    it('reads a rollout while the event loop keeps running', async () => {
      const order: string[] = []
      setImmediate(() => order.push('timer'))

      await history()
        .messages(PROJECT, SESSION)
        .then(() => order.push('read'))

      expect(order).toEqual(['timer', 'read'])
    })

    it('reads the context tokens from the last token_count event', () => {
      expect(history().contextTokens?.(rollout(ROLLOUT_LINES))).toBe(15994)
    })
  })

  describe('codex history sidecar', () => {
    it('lists only the sessions recorded for this cwd', async () => {
      const {sessions} = await history().list({cwd: PROJECT}, FIRST_PAGE)
      expect(sessions.map((session) => session.id)).toEqual([SESSION])
      expect(sessions[0]).toMatchObject({
        derivedTitle: 'List the files',
        lastMessage: 'Two files.',
        sizeBytes: expect.any(Number),
        model: 'gpt-5.5',
        totalTokens: 32017,
        updatedAt: 1785417797467,
        createdAt: 1785417777467,
      })
    })

    it('reads one session meta for this cwd and none for another', async () => {
      const {sessions} = await history().list({cwd: PROJECT}, FIRST_PAGE)
      expect(await history().meta(PROJECT, SESSION)).toEqual(sessions[0])
      expect(await history().meta(PROJECT, STRAY)).toBeNull()
      expect(await history().meta(PROJECT, DELETED)).toBeNull()
    })

    it('lists the sessions of every project, each with the cwd its thread records', async () => {
      const {sessions} = await history().list({everywhere: true}, FIRST_PAGE)
      expect(sessions.map(({id, cwd}) => ({id, cwd}))).toEqual(
        expect.arrayContaining([
          {id: SESSION, cwd: PROJECT},
          {id: STRAY, cwd: OTHER},
        ]),
      )
      expect(sessions.map((session) => session.id)).not.toContain(DELETED)
    })

    it('pages newest first, breaks updatedAt ties by id, and reads only the rollouts on the page', async () => {
      const paged = '/workspace/codex.paged'
      const rolloutOf = (id: string) => seedRollout(`rollout-2026-07-30T16-23-00-${id}.jsonl`, ROLLOUT_LINES)
      const oldest = join(sessionsRoot(), '2026', '07', '30', 'rollout-oldest.jsonl')
      blockingTranscript(oldest, 1)
      seedThreads([
        {id: PAGED_IDS.newest, path: await rolloutOf(PAGED_IDS.newest), cwd: paged, updated: 3_000_000},
        {id: PAGED_IDS.tieHigh, path: await rolloutOf(PAGED_IDS.tieHigh), cwd: paged, updated: 2_000_000},
        {id: PAGED_IDS.tieLow, path: await rolloutOf(PAGED_IDS.tieLow), cwd: paged, updated: 2_000_000},
        {id: PAGED_IDS.oldest, path: oldest, cwd: paged, updated: 1_000_000},
      ])
      await expectPagingContract(
        (page) => history().list({cwd: paged}, page),
        PAGED_IDS,
        2_000_000,
        async () => {
          rmSync(oldest)
          await writeFile(oldest, rollout(ROLLOUT_LINES), 'utf8')
        },
      )
    })

    it('parses the rollout of a session that belongs to the cwd', async () => {
      const messages = await history().messages(PROJECT, SESSION)
      expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    })

    it('returns nothing when the session was recorded in another cwd', async () => {
      expect(await history().messages(PROJECT, STRAY)).toEqual([])
      const handle = history().observe(PROJECT, STRAY)
      const read = await handle.read()
      expect(read.ok).toBe(false)
      handle.close()
    })

    it('revises the resolved rollout file without reading it', async () => {
      const handle = history().observe(PROJECT, SESSION)
      const revision = await handle.revision()
      expect('ok' in revision).toBe(false)
      if ('ok' in revision) throw new Error(revision.detail)
      expect(revision.changedAt).toBeGreaterThan(0)
      expect(revision.rev).toMatch(/^\d+:/)
      handle.close()
    })
  })

  describe('codex refuses a persisted rollout path that leaves the codex home', () => {
    it('ignores a threads row pointing outside .codex in reads, meta and list, and falls back to the contained scan', async () => {
      const planted = HarnessSessionId.parse('019fb340-0000-7000-8000-0000000000e5')
      const outside = join(await realpath(await mkdtemp(join(tmpdir(), 'codex-escape-'))), 'planted.jsonl')
      await writeFile(outside, rollout(ROLLOUT_LINES), 'utf8')
      seedThreads([{id: planted, path: outside, cwd: PROJECT, updated: 2}])

      expect(rolloutPath(planted)).toBeNull()
      expect(await history().messages(PROJECT, planted)).toEqual([])
      expect(await history().meta(PROJECT, planted)).toBeNull()
      expect((await history().list({cwd: PROJECT}, FIRST_PAGE)).sessions.map((session) => session.id)).not.toContain(
        planted,
      )
    })
  })

  describe('codex history follows a symlinked project root', () => {
    it('reads a rollout recorded under the real path when asked through the link', async () => {
      const root = await realpath(await mkdtemp(join(tmpdir(), 'codex-symlink-')))
      const real = join(root, 'project')
      const link = join(root, 'project-link')
      const linked = HarnessSessionId.parse('019fb340-0000-7000-8000-00000000011c')
      await mkdir(real, {recursive: true})
      await symlink(real, link)
      await seedRollout(
        `rollout-2026-07-30T16-23-00-${linked}.jsonl`,
        ROLLOUT_LINES.map((line) =>
          line.type === 'session_meta'
            ? {...line, payload: {...line.payload, session_id: linked, id: linked, cwd: real}}
            : line,
        ),
      )
      expect(await history().messages(link, linked)).toHaveLength(2)
      const handle = history().observe(link, linked)
      const chunk = await handle.read()
      handle.close()
      expect('ok' in chunk && chunk.ok).toBe(true)
    })
  })
})

describe('codex models', () => {
  const MODELS_CACHE = {
    fetched_at: '2026-10-30T00:00:00Z',
    etag: 'etag-1',
    client_version: '0.150.0',
    models: [
      {
        slug: 'gpt-second',
        display_name: 'GPT Second',
        visibility: 'list',
        priority: 2,
        supported_in_api: true,
        supported_reasoning_levels: [
          {effort: 'low', description: 'Fast'},
          {effort: 'xhigh', description: 'Extra high'},
          {effort: 'max', description: 'Maximum'},
          {effort: 'ultra', description: 'Maximum with delegation'},
        ],
      },
      {slug: 'gpt-hidden', display_name: 'GPT Hidden', visibility: 'hide', priority: 0, supported_in_api: true},
      {slug: 'gpt-first', display_name: 'GPT First', visibility: 'list', priority: 1, supported_in_api: true},
    ],
  }

  const fallback = CODEX_MODELS.map((id) => ({id, name: id, group: 'Codex'}))

  const codexDir = (files: Record<string, string>): string => {
    const dir = join(mkdtempSync(join(tmpdir(), 'codex-models-')), '.codex')
    mkdirSync(dir)
    Object.entries(files).forEach(([name, content]) => writeFileSync(join(dir, name), content))
    return dir
  }

  describe('codexModels', () => {
    it('lists the listed models from codex catalog in priority order, with the efforts conciv can pick', () => {
      const dir = codexDir({'models_cache.json': JSON.stringify(MODELS_CACHE)})
      expect(codexModels(dir)).toEqual([
        {id: 'gpt-first', name: 'GPT First', group: 'Codex'},
        {id: 'gpt-second', name: 'GPT Second', group: 'Codex', efforts: ['low', 'xhigh', 'max']},
      ])
    })

    it('falls back to the static codex models when the catalog is missing', () => {
      expect(codexModels(codexDir({}))).toEqual(fallback)
    })

    it('falls back to the static codex models when the catalog is not json', () => {
      expect(codexModels(codexDir({'models_cache.json': '{not json'}))).toEqual(fallback)
    })
  })

  describe('codexDefaultModel', () => {
    it('uses the model codex config names', () => {
      const dir = codexDir({
        'models_cache.json': JSON.stringify(MODELS_CACHE),
        'config.toml':
          'approval_policy = "never"\nmodel = "gpt-configured"\n\n[profiles.fast]\nmodel = "gpt-profile"\n',
      })
      expect(codexDefaultModel(dir)).toBe('gpt-configured')
    })

    it('uses the top catalog model when codex config names none', () => {
      const dir = codexDir({
        'models_cache.json': JSON.stringify(MODELS_CACHE),
        'config.toml': 'approval_policy = "never"\n',
      })
      expect(codexDefaultModel(dir)).toBe('gpt-first')
    })

    it('ignores a model set only under a profile table', () => {
      const dir = codexDir({
        'models_cache.json': JSON.stringify(MODELS_CACHE),
        'config.toml': 'approval_policy = "never"\n\n[profiles.fast]\nmodel = "gpt-profile"\n',
      })
      expect(codexDefaultModel(dir)).toBe('gpt-first')
    })
  })

  describe('codexHome', () => {
    it('uses CODEX_HOME when set', () => {
      expect(codexHome({CODEX_HOME: '/custom'})).toBe('/custom')
    })

    it('defaults to ~/.codex', () => {
      expect(codexHome({})).toBe(join(homedir(), '.codex'))
    })
  })
})

describe('contained path', () => {
  const UncheckedHarnessSessionId = z.string().brand<'HarnessSessionId'>()

  const scratch: string[] = []

  afterEach(() => {
    for (const dir of scratch.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  function claudeProject(cwd: string): string {
    const root = transcriptRoot(cwd)
    scratch.push(root)
    mkdirSync(root, {recursive: true})
    return root
  }

  describe('containedPath refuses anything that lands outside the root', () => {
    it('accepts a plain child', () => {
      const root = mkdtempSync(join(tmpdir(), 'conciv-contain-'))
      scratch.push(root)
      expect(containedPath(root, join(root, 'a.jsonl'))).not.toBeNull()
    })

    it('refuses the root itself and a traversal out of it', () => {
      const root = mkdtempSync(join(tmpdir(), 'conciv-contain-'))
      scratch.push(root)
      expect(containedPath(root, root)).toBeNull()
      expect(containedPath(root, join(root, '..', 'secret.jsonl'))).toBeNull()
      expect(containedPath(root, join(root, 'a', '..', '..', 'secret.jsonl'))).toBeNull()
    })

    it('refuses a symlink inside the root that points outside it', () => {
      const root = mkdtempSync(join(tmpdir(), 'conciv-contain-'))
      const outside = mkdtempSync(join(tmpdir(), 'conciv-outside-'))
      scratch.push(root, outside)
      const secret = join(outside, 'secret.jsonl')
      writeFileSync(secret, 'TOP SECRET')
      symlinkSync(secret, join(root, 'escape.jsonl'))
      expect(containedPath(root, join(root, 'escape.jsonl'))).toBeNull()
    })
  })

  describe('transcriptPathWithin contains a charset-valid harness session id', () => {
    it('yields a path for an ordinary token', () => {
      const cwd = mkdtempSync(join(tmpdir(), 'conciv-project-'))
      scratch.push(cwd)
      const root = claudeProject(cwd)
      const token = HarnessSessionId.parse('018f3a2b-4c5d-6e7f')
      writeFileSync(join(root, `${token}.jsonl`), '')
      expect(transcriptPathWithin(claudeHistory, cwd, token)).not.toBeNull()
    })

    it('refuses a token whose transcript is a symlink out of the project directory', () => {
      const cwd = mkdtempSync(join(tmpdir(), 'conciv-project-'))
      const outside = mkdtempSync(join(tmpdir(), 'conciv-outside-'))
      scratch.push(cwd, outside)
      const root = claudeProject(cwd)
      const secret = join(outside, 'secret.jsonl')
      writeFileSync(secret, 'TOP SECRET')
      const token = HarnessSessionId.parse('018f3a2b-dead-beef')
      symlinkSync(secret, join(root, `${token}.jsonl`))
      expect(transcriptPathWithin(claudeHistory, cwd, token)).toBeNull()
    })

    it('refuses a traversing token even when the brand parse is bypassed', () => {
      const cwd = mkdtempSync(join(tmpdir(), 'conciv-project-'))
      scratch.push(cwd)
      claudeProject(cwd)
      const traversal = UncheckedHarnessSessionId.parse('../../secret')
      expect(transcriptPathWithin(claudeHistory, cwd, traversal)).toBeNull()
    })

    it('yields nothing for a history that declares no transcript path', () => {
      const cwd = mkdtempSync(join(tmpdir(), 'conciv-project-'))
      scratch.push(cwd)
      const pathless = {...claudeHistory, transcriptPath: undefined, transcriptRoot: undefined}
      expect(transcriptPathWithin(pathless, cwd, HarnessSessionId.parse('tok'))).toBeNull()
    })
  })
})

describe('make text adapter', () => {
  test('makeTextAdapter drives chat() with the provided stream fn', async () => {
    const model = fakeText()
    model.setResponses([({request}) => ({text: `echo:${lastUserModelText(request.messages)}`})])
    const adapter = makeTextAdapter('scripted', (options) => model.chatStream(options))
    const chunks = await runAdapterTurn(adapter, [{role: 'user', content: 'hi'}])
    const text = chunks.flatMap((chunk) => (chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT ? [chunk.delta] : []))
    expect(text.join('')).toBe('echo:hi')
    expect(chunks.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
  })
})

describe('native record ids', () => {
  const line = (record: unknown): string => JSON.stringify(record)

  describe('claude transcript records anchor their message ids', () => {
    it('mints each message id from the native record uuid', () => {
      const jsonl = [
        line({
          type: 'user',
          uuid: '93715f99-92e9-44dc-a1c1-c4a540f4c42d',
          message: {role: 'user', content: [{type: 'text', text: 'say it again'}]},
        }),
        line({
          type: 'assistant',
          uuid: '06b2a323-34c7-4913-9f9d-9681020b974b',
          message: {id: 'msg_1', role: 'assistant', content: [{type: 'text', text: 'here you go'}]},
        }),
      ].join('\n')
      expect(parseHistory(jsonl).map((message) => message.id)).toEqual([
        '93715f99-92e9-44dc-a1c1-c4a540f4c42d',
        '06b2a323-34c7-4913-9f9d-9681020b974b',
      ])
    })

    it('keeps the uuid of the record that opened a streamed assistant turn', () => {
      const jsonl = [
        line({type: 'user', uuid: 'u-1', message: {role: 'user', content: [{type: 'text', text: 'hello'}]}}),
        line({
          type: 'assistant',
          uuid: 'a-first',
          message: {id: 'msg_shared', role: 'assistant', content: [{type: 'text', text: 'part one'}]},
        }),
        line({
          type: 'assistant',
          uuid: 'a-second',
          message: {id: 'msg_shared', role: 'assistant', content: [{type: 'text', text: 'part two'}]},
        }),
      ].join('\n')
      const messages = parseHistory(jsonl)
      expect(messages.map((message) => message.id)).toEqual(['u-1', 'a-first'])
      expect(messages[1]?.parts).toEqual([
        {type: 'text', content: 'part one'},
        {type: 'text', content: 'part two'},
      ])
    })

    it('falls back to positional ids when the records carry no uuid', () => {
      const jsonl = [
        line({type: 'user', message: {role: 'user', content: [{type: 'text', text: 'no uuid here'}]}}),
        line({type: 'assistant', message: {id: 'msg_1', role: 'assistant', content: [{type: 'text', text: 'ok'}]}}),
      ].join('\n')
      expect(parseHistory(jsonl).map((message) => message.id)).toEqual(['h1', 'h2'])
    })
  })
})

describe('opencode chat config', () => {
  const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
    cwd: '/tmp/opencode-test',
    sessionId: SessionId.parse('conciv_s-1'),
    resumeSessionId: null,
    env: {},
    kind: 'chat',
    ...over,
  })

  describe('opencode chatConfig', () => {
    it('returns their opencode adapter for the requested model', () => {
      const config = opencode.chatConfig(deps({model: 'opencode/gpt-5.1'}))
      expect(config.adapter.name).toBe('opencode')
      expect(config.adapter.model).toBe('opencode/gpt-5.1')
    })

    it('defaults the model when none is requested', () => {
      expect(opencode.chatConfig(deps()).adapter.model).toBe('opencode/claude-sonnet-4-5')
    })

    it('threads the resume session id through modelOptions and leaves the workdir to the sandbox', () => {
      expect(opencode.chatConfig(deps()).modelOptions).toEqual({})
      expect(opencode.chatConfig(deps({resumeSessionId: HarnessSessionId.parse('ses-9')})).modelOptions).toEqual({
        sessionId: 'ses-9',
      })
    })
  })
})

describe('opencode models', () => {
  const savedPath = process.env.PATH

  afterEach(() => {
    process.env.PATH = savedPath
  })

  const verbose = (models: {providerID: string; id: string; name: string; release_date?: string; status?: string}[]) =>
    `\u001b]0;ready\u0007${models.map((model) => `${model.providerID}/${model.id}\n${JSON.stringify(model, null, 2)}`).join('\n')}\n`

  async function fakeOpencode(output: string, exitCode = 0): Promise<void> {
    const bin = await mkdtemp(join(tmpdir(), 'conciv-fake-opencode-'))
    await writeFile(join(bin, 'listing.txt'), output)
    await writeFile(
      join(bin, 'opencode'),
      `#!/bin/sh\n[ "$1 $2" = "models --verbose" ] || exit 2\ncat "${join(bin, 'listing.txt')}"\nexit ${exitCode}\n`,
      {mode: 0o755},
    )
    process.env.PATH = `${bin}:${savedPath ?? ''}`
  }

  it('lists the live models opencode reports, named by model, newest first, deprecated ones left out', async () => {
    await fakeOpencode(
      verbose([
        {providerID: 'openai', id: 'gpt-5.2', name: 'GPT-5.2', release_date: '2026-05-01'},
        {providerID: 'anthropic', id: 'claude-opus-4-5', name: 'Claude Opus 4.5', release_date: '2026-09-01'},
        {providerID: 'opencode', id: 'claude-opus-4-5', name: 'Claude Opus 4.5', release_date: '2026-09-01'},
        {providerID: 'opencode', id: 'big-pickle', name: 'Big Pickle'},
        {providerID: 'openai', id: 'gpt-4', name: 'GPT-4', release_date: '2023-03-14', status: 'deprecated'},
      ]),
    )

    expect(await resolveHarnessModels(opencode)).toEqual([
      {
        id: 'anthropic/claude-opus-4-5',
        name: 'Claude Opus 4.5 · anthropic',
        description: 'anthropic',
        group: 'OpenCode',
      },
      {id: 'opencode/claude-opus-4-5', name: 'Claude Opus 4.5 · opencode', description: 'opencode', group: 'OpenCode'},
      {id: 'openai/gpt-5.2', name: 'GPT-5.2', description: 'openai', group: 'OpenCode'},
      {id: 'opencode/big-pickle', name: 'Big Pickle', description: 'opencode', group: 'OpenCode'},
    ])
  })

  it('collapses region and routing duplicates of one model to one row, preferring the global route', async () => {
    await fakeOpencode(
      verbose([
        {
          providerID: 'amazon-bedrock',
          id: 'anthropic.claude-haiku-5-5',
          name: 'Claude Haiku 5.5',
          release_date: '2026-10-07',
        },
        {
          providerID: 'amazon-bedrock',
          id: 'au.anthropic.claude-haiku-5-5',
          name: 'Claude Haiku 5.5 (AU)',
          release_date: '2026-10-07',
        },
        {
          providerID: 'amazon-bedrock',
          id: 'eu.anthropic.claude-haiku-5-5',
          name: 'Claude Haiku 5.5 (EU)',
          release_date: '2026-10-07',
        },
        {
          providerID: 'amazon-bedrock',
          id: 'global.anthropic.claude-haiku-5-5',
          name: 'Claude Haiku 5.5 (Global)',
          release_date: '2026-10-07',
        },
        {
          providerID: 'amazon-bedrock',
          id: 'us.anthropic.claude-haiku-5-5',
          name: 'Claude Haiku 5.5 (US)',
          release_date: '2026-10-07',
        },
        {
          providerID: 'amazon-bedrock',
          id: 'au.anthropic.claude-opus-4-6-v1',
          name: 'AU Anthropic Claude Opus 4.6',
          release_date: '2026-02-05',
        },
        {
          providerID: 'amazon-bedrock',
          id: 'us.anthropic.claude-opus-4-6-v1',
          name: 'Claude Opus 4.6 (US)',
          release_date: '2026-02-05',
        },
        {
          providerID: 'amazon-bedrock',
          id: 'anthropic.claude-opus-4-6-v1',
          name: 'Claude Opus 4.6',
          release_date: '2026-02-05',
        },
        {providerID: 'amazon-bedrock', id: 'us.moonshotai.kimi-k3', name: 'Kimi K3 (US)', release_date: '2026-07-16'},
        {
          providerID: 'amazon-bedrock',
          id: 'global.moonshotai.kimi-k3',
          name: 'Kimi K3 (Global)',
          release_date: '2026-07-16',
        },
        {providerID: 'amazon-bedrock', id: 'openai.gpt-oss-120b', name: 'gpt-oss-120b', release_date: '2025-08-05'},
        {providerID: 'amazon-bedrock', id: 'openai.gpt-oss-120b-1:0', name: 'gpt-oss-120b', release_date: '2025-08-05'},
        {providerID: 'opencode-go', id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', release_date: '2026-10-07'},
      ]),
    )

    expect(await resolveHarnessModels(opencode)).toEqual([
      {
        id: 'amazon-bedrock/global.anthropic.claude-haiku-5-5',
        name: 'Claude Haiku 5.5 · amazon-bedrock',
        description: 'amazon-bedrock',
        group: 'OpenCode',
      },
      {
        id: 'opencode-go/claude-haiku-5-5',
        name: 'Claude Haiku 5.5 · opencode-go',
        description: 'opencode-go',
        group: 'OpenCode',
      },
      {
        id: 'amazon-bedrock/global.moonshotai.kimi-k3',
        name: 'Kimi K3 (Global)',
        description: 'amazon-bedrock',
        group: 'OpenCode',
      },
      {
        id: 'amazon-bedrock/anthropic.claude-opus-4-6-v1',
        name: 'Claude Opus 4.6',
        description: 'amazon-bedrock',
        group: 'OpenCode',
      },
      {
        id: 'amazon-bedrock/openai.gpt-oss-120b',
        name: 'gpt-oss-120b',
        description: 'amazon-bedrock',
        group: 'OpenCode',
      },
    ])
  })

  it('rejects when the opencode CLI fails, so the saved list stays in use', async () => {
    await fakeOpencode('', 1)

    await expect(resolveHarnessModels(opencode)).rejects.toThrow()
  })
})

describe('opencode history', () => {
  const PROJECT = '/workspace/demo'
  const OTHER = '/workspace/other'
  const SESSION = HarnessSessionId.parse('ses_05567821affeyuqQ2PYBLsfUj8')
  const STRAY = HarnessSessionId.parse('ses_0556942b8ffeMdQJ7mgrX6NYLi')

  const MESSAGES = [
    {id: 'msg_1', data: {role: 'user', time: {created: 1785273548288}, agent: 'build'}},
    {
      id: 'msg_2',
      data: {
        parentID: 'msg_1',
        role: 'assistant',
        mode: 'build',
        path: {cwd: PROJECT, root: PROJECT},
        modelID: 'gpt-5.6-sol',
        providerID: 'openai',
      },
    },
  ]

  const LATEST_MESSAGE_MS = 1785273548289

  const PARTS = [
    {id: 'prt_1', message: 'msg_1', data: {type: 'text', text: 'count the files'}},
    {id: 'prt_2', message: 'msg_2', data: {snapshot: '5f0b32be', type: 'step-start'}},
    {
      id: 'prt_3',
      message: 'msg_2',
      data: {
        type: 'tool',
        callID: 'toolu_01E8',
        tool: 'grep',
        state: {
          status: 'completed',
          input: {pattern: 'Image', path: PROJECT},
          output: 'Found 1 matches',
          time: {start: 1770366532824, end: 1770366532837},
        },
      },
    },
    {id: 'prt_4', message: 'msg_2', data: {type: 'reasoning', text: ''}},
    {
      id: 'prt_5',
      message: 'msg_2',
      data: {type: 'tool', callID: 'toolu_02', tool: 'bash', state: {status: 'error', error: 'command not found'}},
    },
    {
      id: 'prt_6',
      message: 'msg_2',
      data: {type: 'tool', callID: 'toolu_03', tool: 'edit', state: {status: 'running', input: {filePath: 'a.ts'}}},
    },
    {id: 'prt_7', message: 'msg_2', data: {type: 'reasoning', text: 'checking the matches'}},
    {id: 'prt_8', message: 'msg_2', data: {type: 'text', text: 'One match.'}},
  ]

  function seed(sessionId: HarnessSessionId, directory: string, rowSuffix: string): void {
    const db = new DatabaseSync(storagePath())
    db.exec(
      `create table if not exists session (id text primary key, project_id text not null default '', directory text not null, title text not null, time_created integer not null, time_updated integer not null, time_archived integer, model text, tokens_input integer not null default 0, tokens_output integer not null default 0)`,
    )
    db.exec(
      `create table if not exists message (id text primary key, session_id text not null, time_created integer not null, time_updated integer not null, data text not null)`,
    )
    db.exec(
      `create table if not exists part (id text primary key, message_id text not null, session_id text not null, time_created integer not null, time_updated integer not null, data text not null)`,
    )
    const session = db.prepare(
      'insert into session (id, directory, title, time_created, time_updated, time_archived, model, tokens_input, tokens_output) values (?,?,?,?,?,?,?,?,?)',
    )
    session.run(
      sessionId,
      directory,
      'Count the files',
      1785273548261,
      1785305469728,
      null,
      'openai/gpt-5.6-sol',
      300,
      120,
    )

    const message = db.prepare(
      'insert into message (id, session_id, time_created, time_updated, data) values (?,?,?,?,?)',
    )
    MESSAGES.forEach((row, index) => {
      message.run(
        `${row.id}${rowSuffix}`,
        sessionId,
        1785273548288 + index,
        1785273548288 + index,
        JSON.stringify(row.data),
      )
    })
    const part = db.prepare(
      'insert into part (id, message_id, session_id, time_created, time_updated, data) values (?,?,?,?,?,?)',
    )
    PARTS.forEach((row, index) => {
      part.run(
        `${row.id}${rowSuffix}`,
        `${row.message}${rowSuffix}`,
        sessionId,
        1785273548300 + index,
        1785273548300 + index,
        JSON.stringify(row.data),
      )
    })
    db.close()
  }

  const history = () => {
    const found = opencode.history
    if (!found) throw new Error('opencode harness has no history')
    return found
  }

  beforeAll(async () => {
    await mkdir(dirname(storagePath()), {recursive: true})
    seed(SESSION, PROJECT, '')
    seed(STRAY, OTHER, '_stray')
  })

  describe('opencode history sidecar', () => {
    it('lists only the sessions opened in this directory', async () => {
      const {sessions} = await history().list({cwd: PROJECT}, FIRST_PAGE)
      expect(sessions.map((session) => session.id)).toEqual([SESSION])
      expect(sessions[0]).toMatchObject({
        derivedTitle: 'Count the files',
        model: 'openai/gpt-5.6-sol',
        totalTokens: 420,
        updatedAt: 1785305469728,
        createdAt: 1785273548261,
      })
    })

    it('lists the sessions of every directory, each with the directory its row records', async () => {
      const {sessions} = await history().list({everywhere: true}, FIRST_PAGE)
      expect(sessions.map(({id, cwd}) => ({id, cwd}))).toEqual(
        expect.arrayContaining([
          {id: SESSION, cwd: PROJECT},
          {id: STRAY, cwd: OTHER},
        ]),
      )
    })

    it('rebuilds the conversation from the message and part rows', async () => {
      expect(await history().messages(PROJECT, SESSION)).toEqual([
        {id: 'msg_1', role: 'user', parts: [{type: 'text', content: 'count the files'}]},
        {
          id: 'msg_2',
          role: 'assistant',
          parts: [
            {
              type: 'tool-call',
              id: 'toolu_01E8',
              name: 'grep',
              arguments: JSON.stringify({pattern: 'Image', path: PROJECT}),
              state: 'input-complete',
            },
            {type: 'tool-result', toolCallId: 'toolu_01E8', content: 'Found 1 matches', state: 'complete'},
            {type: 'tool-call', id: 'toolu_02', name: 'bash', arguments: '{}', state: 'input-complete'},
            {type: 'tool-result', toolCallId: 'toolu_02', content: 'command not found', state: 'error'},
            {
              type: 'tool-call',
              id: 'toolu_03',
              name: 'edit',
              arguments: JSON.stringify({filePath: 'a.ts'}),
              state: 'input-complete',
            },
            {type: 'thinking', content: 'checking the matches'},
            {type: 'text', content: 'One match.'},
          ],
        },
      ])
    })

    it('refuses a session that belongs to another directory', async () => {
      expect(await history().messages(PROJECT, STRAY)).toEqual([])
      const handle = history().observe(PROJECT, STRAY)
      expect(await handle.revision()).toMatchObject({ok: false, reason: 'missing'})
      handle.close()
    })

    it('reports the newest message write and the part count for change detection', async () => {
      const handle = history().observe(PROJECT, SESSION)
      expect(await handle.revision()).toEqual({
        rev: `${LATEST_MESSAGE_MS}:${PARTS.length}`,
        changedAt: LATEST_MESSAGE_MS,
      })
      handle.close()
    })

    it('reads one session meta for this directory and none for another', async () => {
      const {sessions} = await history().list({cwd: PROJECT}, FIRST_PAGE)
      expect(await history().meta(PROJECT, SESSION)).toEqual(sessions[0])
      expect(await history().meta(PROJECT, STRAY)).toBeNull()
    })

    it('pages newest first, breaks updatedAt ties by id, and counts messages of the page', async () => {
      const paged = '/workspace/opencode.paged'
      const db = new DatabaseSync(storagePath())
      const session = db.prepare(
        'insert into session (id, directory, title, time_created, time_updated) values (?,?,?,?,?)',
      )
      session.run(PAGED_IDS.newest, paged, 'newest', 1, 3_000_000)
      session.run(PAGED_IDS.tieHigh, paged, 'tie high', 1, 2_000_000)
      session.run(PAGED_IDS.tieLow, paged, 'tie low', 1, 2_000_000)
      session.run(PAGED_IDS.oldest, paged, 'oldest', 1, 1_000_000)
      const message = db.prepare(
        'insert into message (id, session_id, time_created, time_updated, data) values (?,?,?,?,?)',
      )
      message.run('msg_low_1', PAGED_IDS.tieLow, 1, 1, '{}')
      message.run('msg_low_2', PAGED_IDS.tieLow, 2, 2, '{}')
      db.close()
      await expectPagingContract(
        (page) => history().list({cwd: paged}, page),
        PAGED_IDS,
        2_000_000,
        async () => {},
      )
      const lastPage = await history().list(
        {cwd: paged},
        {
          after: {updatedAt: 2_000_000, id: HarnessSessionId.parse(PAGED_IDS.tieHigh)},
          limit: 1,
        },
      )
      expect(lastPage.sessions).toMatchObject([{id: PAGED_IDS.tieLow}])
    })

    it('returns nothing when there is no opencode database', async () => {
      renameSync(storagePath(), `${storagePath()}.kept`)
      try {
        expect(await history().list({cwd: PROJECT}, FIRST_PAGE)).toEqual({sessions: [], next: null})
        expect(await history().messages(PROJECT, SESSION)).toEqual([])
      } finally {
        renameSync(`${storagePath()}.kept`, storagePath())
      }
    })
  })

  describe('opencode history follows a symlinked project root', () => {
    it('reads a session recorded under the real path when asked through the link', async () => {
      const root = await realpath(await mkdtemp(join(tmpdir(), 'opencode-symlink-')))
      const real = join(root, 'project')
      const link = join(root, 'project-link')
      const linked = HarnessSessionId.parse('ses_linked')
      await mkdir(real, {recursive: true})
      await symlink(real, link)
      seed(linked, real, '_linked')
      expect((await history().list({cwd: link}, FIRST_PAGE)).sessions.map((session) => session.id)).toEqual([linked])
      expect(await history().messages(link, linked)).toHaveLength(2)
      const handle = history().observe(link, linked)
      const chunk = await handle.read()
      handle.close()
      expect('ok' in chunk && chunk.ok).toBe(true)
    })
  })
})

describe('pi history', () => {
  const PROJECT = '/workspace/pi.demo'
  const SESSION = HarnessSessionId.parse('39a461cc-ceb9-495a-891b-b11fe6a03c55')
  const FILE = `2026-07-30T09-45-14-653Z_${SESSION}.jsonl`
  const CONCIV_NAMED = HarnessSessionId.parse('conciv-sess-1')

  const LINES = [
    {type: 'session', version: 3, id: SESSION, timestamp: '2026-07-30T09:45:14.653Z', cwd: PROJECT},
    {
      type: 'model_change',
      id: '47cbae6a',
      parentId: null,
      timestamp: '2026-07-30T09:45:14.712Z',
      provider: 'anthropic',
      modelId: 'claude-opus-4-6',
    },
    {
      type: 'message',
      id: '357f05eb',
      parentId: '47cbae6a',
      timestamp: '2026-07-30T09:45:29.518Z',
      message: {role: 'user', content: [{type: 'text', text: 'count the files'}], timestamp: 1785404729517},
    },
    {
      type: 'message',
      id: '493b7644',
      parentId: '357f05eb',
      timestamp: '2026-07-30T09:45:30.837Z',
      message: {
        role: 'assistant',
        content: [
          {type: 'thinking', thinking: 'need to run ls'},
          {type: 'toolCall', id: 'call_1', name: 'bash', arguments: {command: 'ls'}},
        ],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        stopReason: 'toolUse',
      },
    },
    {
      type: 'message',
      id: '5a1c9d02',
      parentId: '493b7644',
      timestamp: '2026-07-30T09:45:31.100Z',
      message: {
        role: 'toolResult',
        toolCallId: 'call_1',
        toolName: 'bash',
        content: [{type: 'text', text: 'README.md'}],
        isError: false,
      },
    },
    {
      type: 'message',
      id: 'abandoned1',
      parentId: '5a1c9d02',
      timestamp: '2026-07-30T09:45:32.000Z',
      message: {role: 'assistant', content: [{type: 'text', text: 'ABANDONED BRANCH'}], stopReason: 'stop'},
    },
    {
      type: 'message',
      id: 'kept1',
      parentId: '5a1c9d02',
      timestamp: '2026-07-30T09:45:33.000Z',
      message: {role: 'assistant', content: [{type: 'text', text: 'One file.'}], stopReason: 'stop'},
    },
  ]

  const jsonl = (lines: unknown[]): string => `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`

  const history = () => {
    const found = pi.history
    if (!found) throw new Error('pi harness has no history')
    return found
  }

  beforeAll(async () => {
    const dir = sessionsDir(PROJECT)
    await mkdir(dir, {recursive: true})
    await writeFile(join(dir, FILE), jsonl(LINES), 'utf8')
    await writeFile(join(dir, `${CONCIV_NAMED}.jsonl`), jsonl(LINES), 'utf8')
  })

  describe('pi session directory encoding', () => {
    it('wraps the cwd in double dashes and keeps dots', () => {
      expect(encodeSessionDir('/workspace/pi.demo')).toBe('--workspace-pi.demo--')
    })
  })

  describe('pi transcript parsing', () => {
    it('walks the newest leaf back to the root and drops the abandoned branch', async () => {
      expect(await history().messages(PROJECT, SESSION)).toEqual([
        {id: '357f05eb', role: 'user', parts: [{type: 'text', content: 'count the files'}]},
        {
          id: '493b7644',
          role: 'assistant',
          parts: [
            {type: 'thinking', content: 'need to run ls'},
            {
              type: 'tool-call',
              id: 'call_1',
              name: 'bash',
              arguments: JSON.stringify({command: 'ls'}),
              state: 'input-complete',
            },
            {type: 'tool-result', toolCallId: 'call_1', content: 'README.md', state: 'complete'},
          ],
        },
        {id: 'kept1', role: 'assistant', parts: [{type: 'text', content: 'One file.'}]},
      ])
    })
  })

  describe('pi history sidecar', () => {
    it('identifies both pi-named and conciv-named transcripts by their file name', async () => {
      const {sessions} = await history().list({cwd: PROJECT}, FIRST_PAGE)
      expect(sessions.map((session) => session.id).toSorted()).toEqual([CONCIV_NAMED, SESSION].toSorted())
      const messages = await history().messages(PROJECT, CONCIV_NAMED)
      expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'assistant'])
    })

    it('lists the sessions stored under the cwd directory', async () => {
      const {sessions} = await history().list({cwd: PROJECT}, FIRST_PAGE)
      const found = sessions.find((session) => session.id === SESSION)
      expect(found).toEqual({
        id: SESSION,
        cwd: PROJECT,
        derivedTitle: 'count the files',
        updatedAt: expect.any(Number),
        sizeBytes: Buffer.byteLength(jsonl(LINES)),
        createdAt: Date.parse('2026-07-30T09:45:14.653Z'),
      })
    })

    it('lists the sessions of every project, each with the cwd its session header records', async () => {
      const elsewhere = '/workspace/pi-elsewhere'
      const dir = sessionsDir(elsewhere)
      await mkdir(dir, {recursive: true})
      const away = HarnessSessionId.parse('away-session')
      const header = {type: 'session', version: 3, id: away, timestamp: '2026-07-30T09:45:14.653Z', cwd: elsewhere}
      await writeFile(join(dir, `2026-07-30T09-45-14-653Z_${away}.jsonl`), jsonl([header, ...LINES.slice(1)]), 'utf8')
      const {sessions} = await history().list({everywhere: true}, FIRST_PAGE)
      expect(sessions.map(({id, cwd}) => ({id, cwd}))).toEqual(
        expect.arrayContaining([
          {id: SESSION, cwd: PROJECT},
          {id: away, cwd: elsewhere},
        ]),
      )
      rmSync(dir, {recursive: true, force: true})
    })

    it('reads a session meta from the head up to the first prompt, never the transcript after it', async () => {
      const project = '/workspace/pi-head.demo'
      const dir = sessionsDir(project)
      await mkdir(dir, {recursive: true})
      const live = HarnessSessionId.parse('live-head')
      const path = join(dir, `2026-07-30T09-45-14-653Z_${live}.jsonl`)
      execFileSync('mkfifo', [path])
      const writer = open(path, 'w')
      const meta = history().meta(project, live)
      const handle = await writer
      try {
        await handle.write(`${jsonl(LINES.slice(0, 3))}{"type":"message","id":"still-writ`)
        expect(await meta).toMatchObject({id: live, derivedTitle: 'count the files', sizeBytes: 0})
      } finally {
        await handle.close()
      }
    })

    it('titles a session by the last name its transcript records', async () => {
      const project = '/workspace/pi-named.demo'
      const dir = sessionsDir(project)
      await mkdir(dir, {recursive: true})
      const named = [...LINES, {type: 'session_info', id: 'n1', parentId: 'kept1', name: 'the renamed count'}]
      await writeFile(join(dir, FILE), jsonl(named), 'utf8')
      expect(await history().meta(project, SESSION)).toMatchObject({
        derivedTitle: 'the renamed count',
        sizeBytes: Buffer.byteLength(jsonl(named)),
      })
    })

    it('reads one session meta by id and none for an unknown one', async () => {
      const {sessions} = await history().list({cwd: PROJECT}, FIRST_PAGE)
      expect(await history().meta(PROJECT, SESSION)).toEqual(sessions.find((session) => session.id === SESSION))
      expect(await history().meta(PROJECT, HarnessSessionId.parse('missing'))).toBeNull()
    })

    it('pages newest first, breaks updatedAt ties by id, and reads only the transcripts on the page', async () => {
      const project = '/workspace/pi-paged.demo'
      const dir = sessionsDir(project)
      await mkdir(dir, {recursive: true})
      const fileOf = (id: string) => join(dir, `2026-07-30T09-45-14-653Z_${id}.jsonl`)
      const write = (id: string, mtimeSec: number) => {
        writeFileSync(fileOf(id), jsonl(LINES))
        utimesSync(fileOf(id), mtimeSec, mtimeSec)
      }
      write(PAGED_IDS.newest, 3000)
      write(PAGED_IDS.tieHigh, 2000)
      write(PAGED_IDS.tieLow, 2000)
      blockingTranscript(fileOf(PAGED_IDS.oldest), 1000)
      await expectPagingContract(
        (page) => history().list({cwd: project}, page),
        PAGED_IDS,
        2_000_000,
        async () => {
          rmSync(fileOf(PAGED_IDS.oldest))
          write(PAGED_IDS.oldest, 1000)
        },
      )
    })

    it('finds the transcript by its session id suffix', async () => {
      expect(history().transcriptPath?.(PROJECT, SESSION)).toBe(join(sessionsDir(PROJECT), FILE))
      const messages = await history().messages(PROJECT, SESSION)
      expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'assistant'])
      const handle = history().observe(PROJECT, SESSION)
      const revision = await handle.revision()
      if ('ok' in revision) throw new Error(revision.detail)
      expect(revision.changedAt).toBeGreaterThan(0)
      handle.close()
    })

    it('reports nothing for an unknown session', async () => {
      const MISSING = HarnessSessionId.parse('missing')
      expect(await history().messages(PROJECT, MISSING)).toEqual([])
      const handle = history().observe(PROJECT, MISSING)
      expect(await handle.revision()).toMatchObject({ok: false, reason: 'missing'})
      handle.close()
    })
  })

  describe('pi transcript discovery survives a hostile sessions directory', () => {
    it('lists the well-formed transcripts of a directory that also holds an unparseable file name', async () => {
      const project = '/workspace/pi-hostile.demo'
      const dir = sessionsDir(project)
      await mkdir(dir, {recursive: true})
      await writeFile(join(dir, FILE), jsonl(LINES), 'utf8')
      await writeFile(join(dir, 'notes about the run.jsonl'), jsonl(LINES), 'utf8')
      expect((await history().list({cwd: project}, FIRST_PAGE)).sessions.map((entry) => entry.id)).toEqual([SESSION])
    })

    it('refuses to observe a transcript whose name links out of the session directory', async () => {
      const project = '/workspace/pi-symlink.demo'
      const dir = sessionsDir(project)
      await mkdir(dir, {recursive: true})
      const outside = join(await mkdtemp(join(tmpdir(), 'pi-outside-')), 'outside.jsonl')
      await writeFile(outside, jsonl(LINES), 'utf8')
      const escapee = HarnessSessionId.parse('escapee')
      await symlink(outside, join(dir, `2026-01-01T00-00-00-000Z_${escapee}.jsonl`))
      const handle = history().observe(project, escapee)
      expect(await handle.revision()).toMatchObject({ok: false})
      handle.close()
      expect(await history().messages(project, escapee)).toEqual([])
    })
  })
})

describe('replayed history from another harness', () => {
  const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const foreignHistory: ModelMessage[] = [
    {
      role: 'user',
      content: [
        {type: 'text', content: 'what is in this screenshot?'},
        {type: 'image', source: {type: 'data', value: pixel, mimeType: 'image/png'}},
      ],
    },
    {
      role: 'assistant',
      content: 'reading the file first',
      toolCalls: [
        {
          id: 'call_minted_elsewhere',
          type: 'function',
          function: {name: 'mcp__other__Read', arguments: '{"path":"a.ts"}'},
        },
      ],
    },
    {role: 'tool', toolCallId: 'call_minted_elsewhere', content: 'export const a = 1'},
    {role: 'assistant', content: 'a red square'},
    {role: 'user', content: 'what did I ask you first?'},
  ]

  it.each([claude, codex, geminiCli, opencode, pi].map((adapter) => [adapter.id, adapter] as const))(
    '%s takes a history with foreign tool calls and earlier images and keeps the question last',
    (_id, adapter) => {
      const cwd = mkdtempSync(join(tmpdir(), 'replay-'))
      const config = adapter.chatConfig({
        cwd,
        sessionId: SessionId.parse('conciv_replay'),
        resumeSessionId: null,
        env: {},
        kind: 'chat',
      })
      const prepared = config.prepareMessages?.(foreignHistory) ?? foreignHistory
      expect(prepared.slice(0, -1)).toEqual(foreignHistory.slice(0, -1))
      expect(prepared.at(-1)?.role).toBe('user')
      expect(lastUserModelText(prepared)).toBe('what did I ask you first?')
    },
  )
})

describe('registry', () => {
  function stub(id: string): HarnessAdapter {
    return defineHarness({
      id,
      binName: id,
      capabilities: {
        resume: false,
        permissionGate: 'none',
        transcriptHistory: false,
        compaction: false,
        systemPrompt: 'none',
        mcp: 'none',
        slashCommands: 'none',
        imageInput: false,
        init: 'none',
      },
      chatConfig: () => ({adapter: fakeText()}),
    })
  }

  describe('harness registry', () => {
    it('registers and resolves an adapter by id', () => {
      registerHarness(stub('test-x'))
      expect(getHarness('test-x')?.id).toBe('test-x')
    })

    it('lists registered ids including the bundled adapters', () => {
      const ids = listHarnesses().map((a) => a.id)
      expect(ids).toContain('claude')
      expect(ids).toContain('codex')
      expect(ids).toContain('gemini-cli')
      expect(ids).toContain('opencode')
      expect(ids).toContain('pi')
    })

    it('returns undefined for an unknown id', () => {
      expect(getHarness('nope')).toBeUndefined()
    })
  })

  describe('defineHarness', () => {
    it('accepts a transcriptHistory harness that provides history and resume implementations', () => {
      const handle: TranscriptHandle = {
        revision: () => Promise.resolve({rev: '0', changedAt: 0}),
        read: () => Promise.resolve({ok: true, rev: '0', changedAt: 0, messages: [], replaced: false}),
        close: () => {},
      }
      const adapter = defineHarness({
        id: 'x',
        binName: 'x',
        capabilities: {
          resume: false,
          permissionGate: 'none',
          transcriptHistory: true,
          compaction: false,
          systemPrompt: 'none',
          mcp: 'none',
          slashCommands: 'none',
          imageInput: false,
          init: 'none',
        },
        chatConfig: () => ({adapter: fakeText()}),
        history: {
          messages: () => Promise.resolve([]),
          observe: () => handle,
          list: () => Promise.resolve({sessions: [], next: null}),
          meta: () => Promise.resolve(null),
        },
        resume: {command: ({nativeId}) => ({bin: 'x', args: [nativeId]})},
      })
      expect(typeof adapter.history?.messages).toBe('function')
    })
  })
})

describe('stubs', () => {
  describe.each([['pi', pi]])('%s stub', (id, adapter) => {
    it('declares its id and capabilities', () => {
      expect(adapter.id).toBe(id)
      expect(adapter.capabilities).toBeDefined()
    })
    it('chatConfig yields a RUN_ERROR naming the missing binary', async () => {
      const config = adapter.chatConfig({
        cwd: '/r',
        sessionId: SessionId.parse('conciv_s'),
        resumeSessionId: null,
        env: {},
        kind: 'chat',
      })
      const chunks = await runAdapterTurn(config.adapter, [{role: 'user', content: 'hi'}])
      const last = chunks.at(-1)
      expect(last?.type).toBe(ChatEventType.RUN_ERROR)
      expect(last && 'message' in last ? last.message : '').toContain(adapter.binName)
    })
  })
})

describe('transcript handles', () => {
  const FIXTURES = new URL('./fixtures/', import.meta.url)

  function fixture(name: string): string {
    return readFileSync(new URL(name, FIXTURES), 'utf8')
  }

  function golden(name: string): {messages: unknown[]; meta?: unknown; name?: unknown; contextTokens?: unknown} {
    return JSON.parse(fixture(name))
  }

  function chunk(result: TranscriptChunk | TranscriptFailure): TranscriptChunk {
    if (!result.ok) throw new Error(`expected a chunk, got ${result.reason}: ${result.detail}`)
    return result
  }

  function revision(result: TranscriptRevision | TranscriptFailure): TranscriptRevision {
    if ('ok' in result) throw new Error(`expected a revision, got ${result.reason}: ${result.detail}`)
    return result
  }

  function failure(result: TranscriptRevision | TranscriptChunk | TranscriptFailure): TranscriptFailure {
    if (!('ok' in result) || result.ok !== false) throw new Error(`expected a failure, got ${JSON.stringify(result)}`)
    return result
  }

  function overwriteAt(path: string, offset: number, text: string): void {
    const fd = openSync(path, 'r+')
    writeSync(fd, Buffer.from(text, 'utf8'), 0, Buffer.byteLength(text), offset)
    closeSync(fd)
  }

  function userLine(text: string): string {
    return JSON.stringify({type: 'user', message: {role: 'user', content: text}})
  }

  async function foldLineByLine(handle: TranscriptHandle, path: string, lines: string[]): Promise<unknown[]> {
    let messages: unknown[] = []
    for (const line of lines) {
      appendFileSync(path, `${line}\n`)
      messages = chunk(await handle.read()).messages
    }
    return messages
  }

  const CLAUDE_CWD = '/workspace/claude.demo'

  describe('claude transcript handle', () => {
    beforeAll(async () => {
      await mkdir(transcriptRoot(CLAUDE_CWD), {recursive: true})
    })

    afterAll(() => {
      rmSync(transcriptRoot(CLAUDE_CWD), {recursive: true, force: true})
    })

    const seed = (id: string, body: string): string => {
      const path = transcriptPath(CLAUDE_CWD, id)
      writeFileSync(path, body)
      return path
    }

    const observe = (id: string): TranscriptHandle => claudeHistory.observe(CLAUDE_CWD, HarnessSessionId.parse(id))

    it('reads only the bytes appended since the previous read', async () => {
      const first = userLine('aaa')
      const rewritten = userLine('zzz')
      const path = seed('incremental', `${first}\n`)
      const handle = observe('incremental')

      const one = chunk(await handle.read())
      expect(one.messages).toEqual([{id: 'h1', role: 'user', parts: [{type: 'text', content: 'aaa'}]}])
      expect(one.replaced).toBe(true)

      expect(Buffer.byteLength(rewritten)).toBe(Buffer.byteLength(first))
      overwriteAt(path, 0, rewritten)
      appendFileSync(path, `${userLine('bbb')}\n`)

      const two = chunk(await handle.read())
      expect(two.replaced).toBe(false)
      expect(two.messages).toEqual([
        {id: 'h1', role: 'user', parts: [{type: 'text', content: 'aaa'}]},
        {id: 'h2', role: 'user', parts: [{type: 'text', content: 'bbb'}]},
      ])
      expect(two.rev).not.toBe(one.rev)

      expect(claudeParse(readFileSync(path, 'utf8')).map((message) => message.parts)).toEqual([
        [{type: 'text', content: 'zzz'}],
        [{type: 'text', content: 'bbb'}],
      ])
      handle.close()
    })

    it('never parses a torn trailing line and folds it once it completes', async () => {
      const complete = userLine('bbb')
      const path = seed('torn', `${userLine('aaa')}\n`)
      const handle = observe('torn')

      expect(chunk(await handle.read()).messages).toHaveLength(1)

      appendFileSync(path, complete.slice(0, 20))
      const partial = chunk(await handle.read())
      expect(partial.messages).toEqual([{id: 'h1', role: 'user', parts: [{type: 'text', content: 'aaa'}]}])
      expect(partial.replaced).toBe(false)

      appendFileSync(path, `${complete.slice(20)}\n`)
      expect(chunk(await handle.read()).messages).toEqual([
        {id: 'h1', role: 'user', parts: [{type: 'text', content: 'aaa'}]},
        {id: 'h2', role: 'user', parts: [{type: 'text', content: 'bbb'}]},
      ])
      handle.close()
    })

    it('rebuilds from scratch when the file shrinks', async () => {
      const path = seed('truncated', [userLine('one'), userLine('two'), userLine('three'), ''].join('\n'))
      const handle = observe('truncated')
      expect(chunk(await handle.read()).messages).toHaveLength(3)

      writeFileSync(path, `${userLine('one')}\n`)
      const after = chunk(await handle.read())
      expect(after.replaced).toBe(true)
      expect(after.messages).toEqual([{id: 'h1', role: 'user', parts: [{type: 'text', content: 'one'}]}])
      handle.close()
    })

    it('reports a missing transcript as a typed failure, never as an empty transcript', async () => {
      const handle = observe('absent')
      expect(failure(await handle.revision()).reason).toBe('missing')
      expect(failure(await handle.read()).reason).toBe('missing')
      handle.close()
    })

    it('reports an unreadable transcript as a typed failure', async () => {
      mkdirSync(transcriptPath(CLAUDE_CWD, 'directory'), {recursive: true})
      const handle = observe('directory')
      expect(failure(await handle.read()).reason).toBe('unreadable')
      handle.close()
    })

    it('releases its parser state on close and refuses later reads', async () => {
      seed('closed', `${userLine('aaa')}\n`)
      const handle = observe('closed')
      expect(chunk(await handle.read()).messages).toHaveLength(1)
      handle.close()
      expect(failure(await handle.revision()).reason).toBe('unreadable')
      expect(failure(await handle.read()).reason).toBe('unreadable')
    })

    it('stats without reading any message content', async () => {
      const path = seed('stat-only', `${userLine('aaa')}\n`)
      const handle = observe('stat-only')
      const one = revision(await handle.revision())
      expect(one.rev).toContain(':')
      expect(one.changedAt).toBeGreaterThan(0)
      appendFileSync(path, `${userLine('bbb')}\n`)
      expect(revision(await handle.revision()).rev).not.toBe(one.rev)
      handle.close()
    })

    it('leaves sub-agent (sidechain) records out of the main thread', () => {
      const jsonl = [
        userLine('main prompt'),
        JSON.stringify({
          type: 'assistant',
          isSidechain: true,
          message: {id: 'msg_side', role: 'assistant', content: [{type: 'text', text: 'subagent chatter'}]},
        }),
        JSON.stringify({type: 'user', isSidechain: true, message: {role: 'user', content: 'subagent prompt'}}),
        JSON.stringify({
          type: 'assistant',
          message: {id: 'msg_m', role: 'assistant', content: [{type: 'text', text: 'main answer'}]},
        }),
        '',
      ].join('\n')
      expect(claudeParse(jsonl)).toEqual([
        {id: 'h1', role: 'user', parts: [{type: 'text', content: 'main prompt'}]},
        {id: 'h2', role: 'assistant', parts: [{type: 'text', content: 'main answer'}]},
      ])
    })

    it('folds line by line to exactly what the whole-file parser produces', async () => {
      const expected = golden('claude-golden.json')
      const raw = fixture('claude-transcript.jsonl')
      expect(claudeParse(raw)).toEqual(expected.messages)
      expect(parseSessionMeta('fixture', '/proj/fixture', raw, 1785417797467)).toEqual(expected.meta)
      expect(claudeHistory.nameFromTranscript?.(raw)).toEqual(expected.name)
      expect(claudeHistory.contextTokens?.(raw)).toEqual(expected.contextTokens)

      const path = seed('equivalence', '')
      const handle = observe('equivalence')
      expect(await foldLineByLine(handle, path, raw.split('\n').filter(Boolean))).toEqual(expected.messages)
      handle.close()
    })

    it('summarises a transcript with one read: meta plus a message tail', async () => {
      const raw = fixture('claude-transcript.jsonl')
      seed('summary', raw)
      const summary = await claudeHistory.summary?.(CLAUDE_CWD, HarnessSessionId.parse('summary'))
      if (!summary) throw new Error('expected a summary')
      const expected = golden('claude-golden.json')
      expect(summary.meta).toMatchObject({
        id: 'summary',
        derivedTitle: 'rename the settings panel',
        sizeBytes: Buffer.byteLength(raw),
        model: 'claude-opus-4-8',
      })
      expect(summary.tail).toEqual(expected.messages.slice(-12))
      expect(await claudeHistory.summary?.(CLAUDE_CWD, HarnessSessionId.parse('absent'))).toBeNull()
    })
  })

  const CODEX_CWD = '/workspace/demo'
  const CODEX_SESSION = 'fixture'

  describe('codex transcript handle', () => {
    const state = {rollouts: ''}

    const seedThread = (id: string, path: string): void => {
      const db = new DatabaseSync(stateDbPath())
      db.exec(
        `create table if not exists threads (id text primary key, rollout_path text not null, cwd text not null, title text not null default '', first_user_message text not null default '', preview text not null default '', model text, tokens_used integer not null default 0, archived integer not null default 0, created_at integer not null, updated_at integer not null, created_at_ms integer, updated_at_ms integer)`,
      )
      db.prepare(
        'insert or replace into threads (id, rollout_path, cwd, created_at, updated_at) values (?,?,?,?,?)',
      ).run(id, path, CODEX_CWD, 1, 2)
      db.close()
    }

    beforeAll(async () => {
      state.rollouts = join(sessionsRoot(), '2026', '07', '30')
      await mkdir(state.rollouts, {recursive: true})
    })

    const observe = (id: string): TranscriptHandle => codexHistory.observe(CODEX_CWD, HarnessSessionId.parse(id))

    it('folds line by line to exactly what the whole-file parser produces', async () => {
      const expected = golden('codex-golden.json')
      const raw = fixture('codex-rollout.jsonl')
      const whole = join(state.rollouts, 'whole-file.jsonl')
      writeFileSync(whole, raw)
      seedThread(CODEX_SESSION, whole)
      expect(await codexHistory.messages(CODEX_CWD, HarnessSessionId.parse(CODEX_SESSION))).toEqual(expected.messages)

      const path = join(state.rollouts, 'equivalence.jsonl')
      writeFileSync(path, '')
      seedThread(CODEX_SESSION, path)
      const handle = observe(CODEX_SESSION)
      expect(await foldLineByLine(handle, path, raw.split('\n').filter(Boolean))).toEqual(expected.messages)
      handle.close()
    })

    it('resolves the rollout path once instead of once per poll', async () => {
      const path = join(state.rollouts, 'resolved-once.jsonl')
      writeFileSync(path, fixture('codex-rollout.jsonl'))
      seedThread(CODEX_SESSION, path)
      const handle = observe(CODEX_SESSION)
      expect(revision(await handle.revision()).changedAt).toBeGreaterThan(0)

      seedThread(CODEX_SESSION, join(state.rollouts, 'moved-away.jsonl'))
      expect(revision(await handle.revision()).changedAt).toBeGreaterThan(0)
      expect(chunk(await handle.read()).messages).toEqual(golden('codex-golden.json').messages)
      handle.close()
      seedThread(CODEX_SESSION, path)
    })

    it('checks the cwd from the head of the rollout, not the whole file', async () => {
      const filler = `${JSON.stringify({type: 'event_msg', payload: {type: 'agent_message', message: 'x'.repeat(500)}})}\n`
      const meta = `${JSON.stringify({type: 'session_meta', payload: {session_id: 'late', cwd: CODEX_CWD}})}\n`
      const path = join(state.rollouts, 'late-meta.jsonl')
      writeFileSync(path, filler.repeat(2200) + meta)
      expect(readFileSync(path).byteLength).toBeGreaterThan(1_000_000)
      seedThread('late-meta', path)
      const handle = observe('late-meta')
      expect(failure(await handle.read()).reason).toBe('corrupt')
      handle.close()
    })

    it('refuses a rollout recorded in another cwd', async () => {
      const path = join(state.rollouts, 'foreign.jsonl')
      writeFileSync(
        path,
        `${JSON.stringify({type: 'session_meta', payload: {session_id: 'foreign', cwd: '/elsewhere'}})}\n`,
      )
      seedThread('foreign', path)
      const handle = observe('foreign')
      expect(failure(await handle.read()).reason).toBe('missing')
      handle.close()
    })

    it('reports an unknown session as missing', async () => {
      const handle = observe('never-recorded')
      expect(failure(await handle.revision()).reason).toBe('missing')
      handle.close()
    })
  })

  const PI_CWD = '/workspace/pi.handle'

  describe('pi transcript handle', () => {
    beforeAll(async () => {
      await mkdir(sessionsDir(PI_CWD), {recursive: true})
    })

    const pathFor = (name: string): string => join(sessionsDir(PI_CWD), name)
    const observe = (id: string): TranscriptHandle => piHistory.observe(PI_CWD, HarnessSessionId.parse(id))

    it('folds line by line to exactly what the whole-file parser produces', async () => {
      const expected = golden('pi-golden.json')
      const raw = fixture('pi-session.jsonl')
      writeFileSync(pathFor('2026-07-30T08-00-00-000Z_whole-file.jsonl'), raw)
      expect(await piHistory.messages(PI_CWD, HarnessSessionId.parse('whole-file'))).toEqual(expected.messages)

      const path = pathFor('2026-07-30T09-45-14-653Z_equivalence.jsonl')
      writeFileSync(path, '')
      const handle = observe('equivalence')
      expect(await foldLineByLine(handle, path, raw.split('\n').filter(Boolean))).toEqual(expected.messages)
      handle.close()
    })

    it('scans the session directory once and keeps the resolved file', async () => {
      const path = pathFor('2026-07-30T10-00-00-000Z_scanned.jsonl')
      writeFileSync(path, fixture('pi-session.jsonl'))
      const handle = observe('scanned')
      expect(revision(await handle.revision()).changedAt).toBeGreaterThan(0)

      renameSync(path, pathFor('2026-07-30T11-00-00-000Z_scanned.jsonl'))
      expect(failure(await handle.revision()).reason).toBe('missing')
      handle.close()
    })

    it('keeps looking for a transcript that does not exist yet', async () => {
      const handle = observe('later')
      expect(failure(await handle.revision()).reason).toBe('missing')
      writeFileSync(pathFor('2026-07-30T12-00-00-000Z_later.jsonl'), fixture('pi-session.jsonl'))
      expect(revision(await handle.revision()).changedAt).toBeGreaterThan(0)
      expect(chunk(await handle.read()).messages).toEqual(golden('pi-golden.json').messages)
      handle.close()
    })
  })

  const OPENCODE_CWD = '/workspace/opencode.handle'
  const OPENCODE_SESSION = 'ses_handle'
  const OPENCODE_STRAY = 'ses_stray'

  describe('opencode transcript handle', () => {
    beforeAll(async () => {
      await mkdir(dirname(storagePath()), {recursive: true})
      const db = new DatabaseSync(storagePath())
      db.exec(
        `create table if not exists session (id text primary key, directory text not null, title text not null, time_created integer not null, time_updated integer not null, time_archived integer, model text, tokens_input integer not null default 0, tokens_output integer not null default 0)`,
      )
      db.exec(
        `create table if not exists message (id text primary key, session_id text not null, time_created integer not null, time_updated integer not null, data text not null)`,
      )
      db.exec(
        `create table if not exists part (id text primary key, message_id text not null, session_id text not null, time_created integer not null, time_updated integer not null, data text not null)`,
      )
      const session = db.prepare(
        'insert into session (id, directory, title, time_created, time_updated, time_archived) values (?,?,?,?,?,?)',
      )
      session.run(OPENCODE_SESSION, OPENCODE_CWD, 'Count the files', 1, 1785305469728, null)
      session.run(OPENCODE_STRAY, '/workspace/other', 'Elsewhere', 1, 2, null)
      db.prepare('insert into message (id, session_id, time_created, time_updated, data) values (?,?,?,?,?)').run(
        'msg_handle_1',
        OPENCODE_SESSION,
        1,
        1785305469728,
        JSON.stringify({role: 'user'}),
      )
      db.prepare(
        'insert into part (id, message_id, session_id, time_created, time_updated, data) values (?,?,?,?,?,?)',
      ).run(
        'prt_handle_1',
        'msg_handle_1',
        OPENCODE_SESSION,
        1,
        1,
        JSON.stringify({type: 'text', text: 'count the files'}),
      )
      db.close()
    })

    const observe = (id: string): TranscriptHandle => opencodeHistory.observe(OPENCODE_CWD, HarnessSessionId.parse(id))

    it('reports the newest write and the part count as its revision', async () => {
      const handle = observe(OPENCODE_SESSION)
      expect(revision(await handle.revision())).toEqual({rev: '1785305469728:1', changedAt: 1785305469728})
      const read = chunk(await handle.read())
      expect(read.replaced).toBe(true)
      expect(read.messages).toEqual([
        {id: 'msg_handle_1', role: 'user', parts: [{type: 'text', content: 'count the files'}]},
      ])
      handle.close()
    })

    it('refuses a session recorded in another directory', async () => {
      const handle = observe(OPENCODE_STRAY)
      expect(failure(await handle.revision()).reason).toBe('missing')
      handle.close()
    })

    it('reports a missing database as a typed failure', async () => {
      renameSync(storagePath(), `${storagePath()}.kept`)
      try {
        const handle = observe(OPENCODE_SESSION)
        expect(failure(await handle.revision()).reason).toBe('missing')
        handle.close()
      } finally {
        renameSync(`${storagePath()}.kept`, storagePath())
      }
    })

    it('keeps one database connection open across polls', async () => {
      const handle = observe(OPENCODE_SESSION)
      expect(revision(await handle.revision()).changedAt).toBe(1785305469728)

      renameSync(storagePath(), `${storagePath()}.kept`)
      try {
        expect(revision(await handle.revision()).changedAt).toBe(1785305469728)
        expect(chunk(await handle.read()).messages).toHaveLength(1)
        handle.close()
      } finally {
        renameSync(`${storagePath()}.kept`, storagePath())
      }
    })

    it('closes the database connection it holds', async () => {
      const openFileCount = (): number => readdirSync('/dev/fd').length
      const warm = observe(OPENCODE_SESSION)
      await warm.read()
      warm.close()

      const before = openFileCount()
      const first = observe(OPENCODE_SESSION)
      const handles = [first, observe(OPENCODE_SESSION), observe(OPENCODE_SESSION)]
      for (const handle of handles) await handle.read()
      expect(openFileCount()).toBeGreaterThanOrEqual(before + handles.length)

      for (const handle of handles) handle.close()
      expect(openFileCount()).toBe(before)
      expect(failure(await first.read()).reason).toBe('unreadable')
    })
  })
})

describe('resume.command', () => {
  const input = {cwd: '/workspace/app', nativeId: HarnessSessionId.parse('native-7')}

  it.each([
    {harness: claude, argv: ['claude', '--resume', 'native-7']},
    {harness: codex, argv: ['codex', 'resume', 'native-7']},
    {harness: opencode, argv: ['opencode', '--session', 'native-7']},
    {harness: pi, argv: ['pi', '--session', 'native-7']},
  ])('$harness.id resumes a session by its native id', ({harness, argv}) => {
    const command = harness.resume.command(input)
    expect([command.bin, ...command.args]).toEqual(argv)
  })
})
