import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest'
import {ChatEventType, type ChatEvent, type ChatMessage, type TokenUsage} from '@conciv/ai'
import {makeTextAdapter} from '@conciv/ai/server'
import {foldChatEvents} from '@conciv/ai/testkit'
import {defineAttachment, defineExtension, defineTool, toolError} from '@conciv/extension'
import {
  createTestHarness,
  createTestkit,
  makeRpcClient,
  type Kit,
  type RunEvents,
  type RunStream,
  type TestHarness,
} from '@conciv/harness-testkit'
import {
  CHAT_SSE_PATH,
  CONCIV_CLAUDE_SESSION_HEADER,
  CONCIV_SESSION_HEADER,
  HarnessSessionId,
} from '@conciv/protocol/chat-types'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import type {PageOutcome} from '@conciv/protocol/page-types'
import {requireClaude, requireTranscriptPath} from './helpers/adapters.js'
import {bootCoreApp} from './helpers/boot.js'
import {connectWidget, type FakeWidget} from './helpers/fake-widget.js'
import {connectMcpClient, type McpClient, type McpTool} from './helpers/mcp-client.js'

describe('chat', () => {
  beforeAll(async () => {
    app.claudeHome = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-chat-home-')))
    app.harness = recordingHarness(createTestHarness(requireClaude()))
    app.kit = await createTestkit(
      app.harness,
      bootCoreApp({claudeHome: app.claudeHome, extensions: [fixtureExtension()], firstChunkTimeoutMs: SILENCE_MS}),
    ).setup()
    app.widget = await connectWidget(app.kit, answerFor)
    app.mcpSession = await newSession()
    app.mcp = await connectMcpClient(`${app.kit.base}/api/mcp`, {[CONCIV_SESSION_HEADER]: app.mcpSession})
  }, 60_000)

  afterAll(async () => {
    app.widget?.end()
    await app.mcp?.close()
    await app.kit?.cleanup()
    rmSync(app.claudeHome, {recursive: true, force: true})
  })

  beforeEach(() => {
    script().release()
    script().releaseTools()
    script().releaseResults()
    script().clearScript()
    cli.usage.splice(0)
    cli.launchFailures.splice(0)
  })

  describe('turns', () => {
    it('a message streams its reply in one run under the client ids, and a reload shows the same turn', async () => {
      const sessionId = await newSession()
      await kit().rpc.drafts.set({sessionId, text: 'a saved draft', selectionStart: 0, selectionEnd: 0})
      const ended = nextTurnEnd(sessionId)
      const events = await finished(sessionId, 'hello', {runId: 'client-run', messageId: 'client-user'})
      await ended
      expect(events.text()).toBe('ok')
      expect(runIdsOf(events, ChatEventType.RUN_STARTED)).toEqual(['client-run'])
      expect(runIdsOf(events, ChatEventType.RUN_FINISHED)).toEqual(['client-run'])
      const hydration = await kit().hydrate(sessionId)
      expect(hydration.messages.map(textOfParts)).toEqual(['hello', 'ok'])
      expect(hydration.messages.map((message) => message.id)).toEqual(['client-user', ...assistantIdsOf(events)])
      expect(hydration).toMatchObject({activeRun: null, lastRun: {runId: 'client-run', phase: 'completed'}})
      expect(await thread(sessionId)).toEqual(hydration.messages)
      expect(await kit().rpc.drafts.get({sessionId})).toBeNull()
      expect(turnEnds.filter((id) => id === sessionId)).toHaveLength(1)
    })

    it.each([
      ['empty thinking, a tool call, then text', {thinking: '', toolCalls: [readCall()], text: 'after the tool'}],
      ['a leading tool call, then text', {toolCalls: [bashCall()], text: 'First words survive.'}],
    ])('no reply text is lost after %s', async (_, turn) => {
      const sessionId = await newSession()
      script().scriptTurn(turn)
      const events = await finished(sessionId, 'go')
      expect(events.text()).toBe(turn.text)
      expect((await assistantTexts(sessionId)).join('')).toBe(turn.text)
    })

    it('a follow-up turn gets the history and the chosen model, and never rewrites the first turn', async () => {
      const sessionId = await newSession()
      script().scriptTurn({toolCalls: [readCall()], text: 'done'})
      await finished(sessionId, 'first question')
      expect(lastRunOf(sessionId)).toMatchObject({model: undefined, resumeSessionId: null})
      expect(lastRunOf(sessionId).messages).not.toMatch(/previous conversation/i)
      const before = await thread(sessionId)
      await kit().rpc.sessions.model({sessionId, model: 'haiku'})
      await finished(sessionId, 'second question')
      expect(lastRunOf(sessionId)).toMatchObject({model: 'haiku', resumeSessionId: null})
      expect(lastRunOf(sessionId).messages).toContain('first question')
      const after = await thread(sessionId)
      expect(after.slice(0, before.length)).toEqual(before)
      expect(after.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
      expect(after[1]?.parts.map((part) => part.type)).toEqual(['tool-call', 'tool-result', 'text'])
      expect(new Set(after.map((message) => message.id)).size).toBe(after.length)
    })

    it('an empty message is answered with a visible "empty" error', async () => {
      const events = await finished(await newSession(), '')
      expect(events.errors().join(' ')).toMatch(/empty/i)
    })

    it('tool cards show the registered tool name, live and after a reload', async () => {
      const sessionId = await newSession()
      script().scriptTurn({toolCalls: TOOL_NAME_FORMS.map(([name]) => ({name, input: {}})), text: 'named'})
      const events = await finished(sessionId, 'names')
      const shown = TOOL_NAME_FORMS.map(([, card]) => card)
      expect(events.toolCalls().map((call) => call.name)).toEqual(shown)
      expect(toolCallParts(await thread(sessionId)).map((part) => part.name)).toEqual(shown)
    })

    it('a CLI error is shown, the turn is marked failed, the hook fires, and the console stays quiet', async () => {
      const sessionId = await newSession()
      script().scriptError('the adapter exploded')
      const ended = nextTurnEnd(sessionId)
      const {result: events, lines} = await capturingConsole(() => finished(sessionId, 'boom'))
      await ended
      expect(events.errors().join(' ')).toContain('the adapter exploded')
      expect((await kit().hydrate(sessionId)).lastRun).toMatchObject({phase: 'failed', error: 'the adapter exploded'})
      expect(lines.filter((line) => line.includes('tanstack-ai:errors'))).toEqual([])
    })

    it('a CLI that fails to launch marks the turn failed and leaves nothing running', async () => {
      const sessionId = await newSession()
      cli.launchFailures.push('the CLI could not launch')
      const events = await finished(sessionId, 'launch', {runId: 'launch-fails'})
      expect(events.errors().join(' ')).toContain('the CLI could not launch')
      expect((await kit().hydrate(sessionId)).lastRun).toMatchObject({runId: 'launch-fails', phase: 'failed'})
      expect((await sessionMeta(sessionId)).running).toBe(false)
    })

    it('sessions run independently and each keeps its own usage', async () => {
      const [slow, quick] = [await newSession(), await newSession()]
      cli.usage.push(usage(11), usage(22))
      script().scriptTurn({toolCalls: [], text: 'slow reply', textPace: {chunk: 1, everyMs: 50}})
      const slowTurn = await send(slow, 'slow')
      await slowTurn.waitForRunStart()
      await finished(quick, 'quick')
      expect((await kit().hydrate(slow)).activeRun).not.toBeNull()
      await slowTurn.done(GUARD)
      expect((await sessionMeta(slow)).usage).toMatchObject({inputTokens: 11, contextWindow: 200_000})
      expect((await sessionMeta(quick)).usage).toMatchObject({inputTokens: 22, contextWindow: 200_000})
    })

    it('many turns with joiners leave memory flat, nothing running, and the next turn clean', async () => {
      const sessions = [await newSession(), await newSession(), await newSession()]
      const heapBefore = process.memoryUsage().heapUsed
      for (const round of [1, 2, 3, 4]) await Promise.all(sessions.map((sessionId) => joinedTurn(sessionId, round)))
      globalThis.gc?.()
      expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(80 * 1024 * 1024)
      expect((await Promise.all(sessions.map(sessionMeta))).some((meta) => meta.running)).toBe(false)
      expect((await finished(sessions[0] ?? '', 'after the load')).text()).toBe('ok')
    })
  })

  describe('stop', () => {
    it('stop ends the turn cleanly as stopped and the next message starts a fresh turn', async () => {
      const sessionId = await newSession()
      const {seen} = await heldTurn(sessionId, 'stop me', 'stopped-run')
      const ended = nextTurnEnd(sessionId)
      await kit().rpc.chat.stop({sessionId})
      expect(['stopping', 'aborted']).toContain((await kit().hydrate(sessionId)).lastRun?.phase)
      await ended
      expect((await kit().hydrate(sessionId)).lastRun).toMatchObject({phase: 'aborted', finishedAt: expect.any(Number)})
      expect(seen.filter((chunk) => chunk.type === ChatEventType.RUN_ERROR)).toEqual([])
      expect(JSON.stringify(seen)).not.toMatch(/exit(ed)?( with)?( code| status)? 143|SIGTERM/i)
      script().release()
      expect((await finished(sessionId, 'right after', {runId: 'after-stop'})).text()).toBe('ok')
      expect((await kit().hydrate(sessionId)).lastRun).toMatchObject({runId: 'after-stop', phase: 'completed'})
    })

    it('a viewer that leaves only detaches: the turn completes, saves usage, and a rejoin sees all of it', async () => {
      const sessionId = await newSession()
      cli.usage.push(usage(120))
      script().hold()
      const ended = nextTurnEnd(sessionId)
      await leaveAfterFirstText(sessionId, 'detached-run')
      const rejoin = kit().join('detached-run')
      script().release()
      await ended
      expect((await rejoin.done(GUARD)).text()).toBe('ok')
      expect((await kit().hydrate(sessionId)).lastRun).toMatchObject({phase: 'completed'})
      expect(await assistantTexts(sessionId)).toEqual(['ok'])
      expect((await sessionMeta(sessionId)).usage).toMatchObject({inputTokens: 120})
    })

    it('deleting a session with a live turn ends that turn', async () => {
      const sessionId = await newSession()
      await heldTurn(sessionId, 'delete me', 'deleted-run')
      const ended = nextTurnEnd(sessionId)
      await kit().rpc.sessions.delete({sessionId})
      await ended
      expect((await kit().hydrate(sessionId)).activeRun).toBeNull()
      expect((await kit().rpc.sessions.list(undefined)).some((meta) => meta.id === sessionId)).toBe(false)
    })
  })

  describe('resume after reload', () => {
    it('an idle session reloads to the exact empty shape', async () => {
      expect(await kit().hydrate(await newSession())).toEqual({
        messages: [],
        activeRun: null,
        lastRun: null,
        pendingApprovals: [],
        interrupts: null,
      })
    })

    it('a reload mid-turn shows it running, and a late viewer catches up once with the same transcript', async () => {
      const sessionId = await newSession()
      const {turn} = await heldTurn(sessionId, 'in flight', 'live-run')
      const live = await kit().hydrate(sessionId)
      expect(live.activeRun).toEqual({runId: 'live-run'})
      expect(live.messages.filter((message) => message.role === 'user').map(textOfParts)).toEqual(['in flight'])
      expect((await sessionMeta(sessionId)).running).toBe(true)
      const late = kit().join('live-run')
      await late.waitForText('ok')
      script().release()
      const [sent, joined] = [await turn.done(GUARD), await late.done(GUARD)]
      expect(runIdsOf(joined, ChatEventType.RUN_STARTED)).toEqual(['live-run'])
      expect(count(joined, ChatEventType.TEXT_MESSAGE_CONTENT)).toBe(1)
      expect(assistantView(joined)).toEqual(assistantView(sent))
      expect((await kit().hydrate(sessionId)).activeRun).toBeNull()
      expect((await sessionMeta(sessionId)).running).toBe(false)
    })

    it('joining a finished turn replays it exactly once', async () => {
      const sessionId = await newSession()
      const sent = await finished(sessionId, 'replay me', {runId: 'replayed-run'})
      const replay = await kit().join('replayed-run').done(GUARD)
      expect(replay.text()).toBe('ok')
      expect(nonCustomTypes(replay)).toEqual(nonCustomTypes(sent))
    })

    it('the session stream shows agent tool calls as nested cards but never a turn start or end', async () => {
      const sessionStream = await kit().events(app.mcpSession)
      const seen = collect(sessionStream)
      await finished(app.mcpSession, 'quiet session stream')
      await executeResult('return await external_fixture_echo({text: "streamed"})')
      await sessionStream.waitFor((chunk) => isResultFor(chunk, 'streamed'), GUARD)
      const cards = toolCallParts(foldChatEvents(seen))
      const execute = cards.findLast((part) => part.name === 'execute_typescript')
      expect(cardMetadata(cards.findLast((part) => part.name === 'fixture_echo'))).toMatchObject({
        parentToolCallId: execute?.id,
      })
      expect(seen.filter(isTurnBoundary)).toEqual([])
    })

    it('the CLI resumes its own session while its transcript exists, and starts fresh when it does not', async () => {
      const resumable = await newSession()
      await finished(resumable, 'remember this')
      writeTranscript(fakeNativeId(resumable), transcriptTurn('remember this', 'ok', 1))
      await finished(resumable, 'resume')
      expect(lastRunOf(resumable).resumeSessionId).toBe(fakeNativeId(resumable))
      expect(lastRunOf(resumable).messages).not.toContain('remember this')
      expect((await sessionMeta(resumable)).native?.nativeId).toBe(fakeNativeId(resumable))
      const stale = await newSession()
      await finished(stale, 'no transcript')
      await finished(stale, 'still none')
      expect(lastRunOf(stale).resumeSessionId).toBeNull()
    })

    it('a turn id runs once: resending a finished one resumes it, and two sends at once start one turn', async () => {
      const reused = await newSession()
      await finished(reused, 'original', {runId: 'reused-run'})
      expect((await finished(reused, 'retry', {runId: 'reused-run'})).text()).toBe('ok')
      const twin = await newSession()
      script().hold()
      const sends = [await send(twin, 'twin', {runId: 'twin-run'}), await send(twin, 'twin', {runId: 'twin-run'})]
      script().release()
      await Promise.all(sends.map((turn) => turn.done(GUARD)))
      expect([runsOf(reused).length, runsOf(twin).length]).toEqual([1, 1])
      expect([await userTexts(reused), await userTexts(twin)]).toEqual([['original'], ['twin']])
    })
  })

  describe('approvals', () => {
    it('only tools declared to ask ever ask: mutating and read tools run straight through the sandbox', async () => {
      const sessionId = await newSession()
      codeTurn(TOOLS_WITHOUT_ASK_SCRIPT)
      const events = await finished(sessionId, 'run tools')
      expect(events.custom('approval-requested')).toEqual([])
      expect(resultsOf(await thread(sessionId))).toContain('[{"echoed":"hi"},{"value":7},"undefined"]')
      expect(lastRunOf(sessionId).tools).toContain('fixture_ask')
    })

    it('a risky tool is refused until approved, a denial stays refused, and a one-time approval runs once', async () => {
      const sessionId = await newSession()
      const ran = toolRuns.ask
      const asked = await askTurn(sessionId, 'ask-run')
      expect(JSON.stringify(asked.all)).toContain('needs the user')
      expect(asked.all.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
      expect((await kit().hydrate(sessionId)).pendingApprovals).toEqual([pendingAsk('ask-run')])
      expect((await kit().join('ask-run').done(GUARD)).custom('approval-requested')).toHaveLength(1)
      await decide(sessionId, ASK_ID, false)
      await askTurn(sessionId)
      expect(toolRuns.ask).toBe(ran)
      await decide(sessionId, ASK_ID, true)
      expect((await kit().hydrate(sessionId)).pendingApprovals).toEqual([])
      await askTurn(sessionId)
      expect(toolRuns.ask).toBe(ran + 1)
      expect((await askTurn(sessionId)).custom('approval-requested')).toHaveLength(1)
      await expect(decide(sessionId, 'conciv:tool:nothing', true)).rejects.toMatchObject({code: 'UNKNOWN_REQUEST'})
    })

    it('an unanswered ask never times out and a stop leaves it waiting', async () => {
      const sessionId = await newSession()
      expect(JSON.stringify((await askTurn(sessionId)).all)).not.toMatch(/timed out/)
      await kit().rpc.chat.stop({sessionId})
      expect((await kit().hydrate(sessionId)).pendingApprovals.map((ask) => ask.approvalId)).toEqual([ASK_ID])
    })

    it('approving for the session lets repeats through, except a command that could hide another', async () => {
      const sessionId = await newSession()
      const ran = toolRuns.ask
      await askTurn(sessionId)
      await decide(sessionId, ASK_ID, true, 'session')
      await askTurn(sessionId)
      expect((await askTurn(sessionId)).custom('approval-requested')).toEqual([])
      expect(toolRuns.ask).toBe(ran + 2)
      await commandAsks(sessionId, [PLAIN_COMMAND, HIDDEN_COMMAND])
      await decide(sessionId, PLAIN_COMMAND, true, 'session')
      await decide(sessionId, HIDDEN_COMMAND, true, 'session')
      await finished(sessionId, 'retry one')
      expect(lastRunOf(sessionId).approvals).toEqual(expect.arrayContaining([PLAIN_COMMAND, HIDDEN_COMMAND]))
      await finished(sessionId, 'retry two')
      expect(lastRunOf(sessionId).approvals).toContain(PLAIN_COMMAND)
      expect(lastRunOf(sessionId).approvals).not.toContain(HIDDEN_COMMAND)
    })

    it('the widget calling a tool is the approval, while agents and malformed callers are refused', async () => {
      const ran = toolRuns.ask
      await expect(mcpRpc().registry.call({name: 'fixture_ask', input: {target: 'w'}})).resolves.toEqual({done: 'w'})
      await expect(mcpRpc().server.reload({file: 'a.ts'})).rejects.toMatchObject({code: 'NO_BUNDLER'})
      await expect((await mcpTool('fixture_ask')).execute({target: 'agent'})).rejects.toThrow(/needs the user/)
      expect(toolRuns.ask).toBe(ran + 1)
      await expect(callerWithout().registry.call({name: 'fixture_read', input: {}})).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
      await expect(callerWith('not a session').registry.call({name: 'fixture_read', input: {}})).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringMatching(/malformed/),
      })
      expect((await mcpPost({[CONCIV_SESSION_HEADER]: 'nope'})).status).toBe(400)
    })
  })

  describe('tools and models list', () => {
    it('the widget gets every tool with its full description and the harness model list', async () => {
      const {tools} = await kit().rpc.meta.tools(undefined)
      expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(FIXTURE_TOOLS))
      expect(tools.every((tool) => tool.description.length > 0)).toBe(true)
      expect(tools.find((tool) => tool.name === 'fixture_echo')?.description).toBe(ECHO_DESCRIPTION)
      const models = await kit().rpc.meta.models(undefined)
      expect(models.models.map((model) => model.id)).toEqual(expect.arrayContaining(['opus', 'sonnet', 'haiku']))
      expect(models.defaultModel).toBe('sonnet')
    })
  })

  describe('attachments and images', () => {
    it('an attachment is stored as sent, expanded once for the model only, and the CLI gets the expansion', async () => {
      const sessionId = await newSession()
      await finished(sessionId, {content: attachmentParts()})
      const sent = lastRunOf(sessionId).messages
      expect(sent.indexOf('fixture-expanded')).toBeGreaterThan(sent.indexOf(FIXTURE_MIME))
      expect(sent).toContain('[attachment could not be processed]')
      const user = (await thread(sessionId)).find((message) => message.role === 'user')
      expect(user?.parts.filter((part) => part.type === 'document')).toHaveLength(3)
      expect(user?.parts.filter(isExpansion)).toEqual([EXPANSION_PART])
    })

    it('an image is stored exactly as sent, ignores the draft, and stays in history for later turns', async () => {
      const sessionId = await newSession()
      await kit().rpc.drafts.set({sessionId, text: 'a saved draft', selectionStart: 0, selectionEnd: 0})
      await finished(sessionId, {content: [{type: 'text', content: 'what color?'}, IMAGE]})
      await finished(sessionId, 'and the shape?')
      const messages = await thread(sessionId)
      expect(messages.find((message) => message.role === 'user')?.parts).toEqual([
        {type: 'text', content: 'what color?'},
        IMAGE,
      ])
      expect(await userTexts(sessionId)).toEqual(['what color?', 'and the shape?'])
      expect(messages.flatMap((message) => message.parts).filter((part) => part.type === 'image')).toHaveLength(1)
      expect(lastRunOf(sessionId).messages).toContain(ONE_PIXEL_PNG)
      expect(await kit().rpc.drafts.get({sessionId})).toBeNull()
    })
  })

  describe('compaction', () => {
    it('compact runs as its own turn, never overlaps another, marks the boundary and keeps the history', async () => {
      const sessionId = await newSession()
      await finished(sessionId, 'one')
      await finished(sessionId, 'two')
      script().hold()
      const compacts = Promise.all([kit().rpc.sessions.compact({sessionId}), kit().rpc.sessions.compact({sessionId})])
      await kit().events(sessionId)
      expect((await sessionMeta(sessionId)).running).toBe(true)
      script().release()
      await compacts
      expect(lastRunOf(sessionId).kind).toBe('compact')
      expect(lastRunOf(sessionId).messages).toContain('/compact')
      expect(overlapping(runsOf(sessionId))).toBe(false)
      expect(await compactMarkers(sessionId)).toEqual([4, 4])
      expect(await userTexts(sessionId)).toEqual(['one', 'two'])
    })

    it('when the CLI compacts its own transcript the thread is kept and later turns append', async () => {
      const sessionId = await newSession()
      const transcript = await turnWithTranscript(sessionId, 'before compaction', 1)
      writeFileSync(transcript, transcriptTurn('a compacted summary', 'ok', 9).join('\n'))
      expect(await userTexts(sessionId)).toEqual(['before compaction'])
      writeFileSync(transcript, terminalTurns(['a compacted summary', 'after compaction'], 9).join('\n'))
      expect(await userTexts(sessionId)).toEqual(['before compaction', 'after compaction'])
    })
  })

  describe('terminal sessions', () => {
    it('a session started in the terminal opens with its turns, outlives its file, and picks up new ones', async () => {
      const transcript = writeTranscript(TERMINAL_ID, terminalTurns(['terminal one', 'terminal two']))
      const {sessionId} = await kit().rpc.sessions.resolve({id: TERMINAL_ID})
      expect(await userTexts(sessionId)).toEqual(['terminal one', 'terminal two'])
      expect((await sessionMeta(sessionId)).origin).toBe('external')
      rmSync(transcript)
      expect(await userTexts(sessionId)).toEqual(['terminal one', 'terminal two'])
      writeTranscript(TERMINAL_ID, terminalTurns(['terminal one', 'terminal two', 'terminal three']))
      expect(await userTexts(sessionId)).toEqual(['terminal one', 'terminal two', 'terminal three'])
      await finished(sessionId, 'widget after')
      expect(await userTexts(sessionId)).toEqual(['terminal one', 'terminal two', 'terminal three', 'widget after'])
    })

    it('widget turns are never duplicated by the CLI copy, even repeated prompts and image-only turns', async () => {
      const sessionId = await newSession()
      await turnWithTranscript(sessionId, 'open', 1)
      await turnWithTranscript(sessionId, {content: [IMAGE]}, 2, '[image #1 attached]')
      await turnWithTranscript(sessionId, 'open', 3)
      expect(await userTexts(sessionId)).toEqual(['open', '', 'open'])
      expect(await userTexts(sessionId)).toEqual(['open', '', 'open'])
    })

    it('a hostile session id never reads a file outside the project', async () => {
      const outside = writeOutsideProject(transcriptTurn('the secret turn', 'leaked', 1))
      const {sessionId} = await kit().rpc.sessions.resolve({id: '../../secret'})
      const texts = await userTexts(sessionId)
      rmSync(outside, {force: true})
      expect(texts).not.toContain('the secret turn')
    })
  })

  describe('sending while a turn runs', () => {
    it('a second message waits for the running turn, never runs beside it, and both stay in order', async () => {
      const sessionId = await newSession()
      const {turn} = await heldTurn(sessionId, 'first in line')
      const second = await send(sessionId, 'second in line')
      script().release()
      await Promise.all([turn.done(GUARD), second.done(GUARD)])
      expect(overlapping(runsOf(sessionId))).toBe(false)
      expect(await userTexts(sessionId)).toEqual(['first in line', 'second in line'])
    })

    it('a new message ends the running turn before its own turn starts', async () => {
      const sessionId = await newSession()
      const {turn} = await heldTurn(sessionId, 'interrupted', 'steer-first')
      const second = await send(sessionId, 'resent', {runId: 'steer-second'})
      const first = await turn.done({hangGuardMs: 1_000}).finally(() => script().release())
      expect(first.all.some((chunk) => chunk.type === ChatEventType.RUN_FINISHED)).toBe(true)
      expect(runIdsOf(await second.done(GUARD), ChatEventType.RUN_STARTED)).toContain('steer-second')
    })
  })

  describe('silent CLI', () => {
    it('a CLI that says nothing fails the turn with "no output", tells the viewer, and fires the hook', async () => {
      const sessionId = await newSession()
      script().holdTools()
      const ended = nextTurnEnd(sessionId)
      const turn = await send(sessionId, 'silence', {runId: 'silent-run'})
      const error = turn.waitFor((chunk) => chunk.type === ChatEventType.RUN_ERROR, {hangGuardMs: SILENCE_MS * 2})
      await ended
      expect((await kit().hydrate(sessionId)).lastRun).toMatchObject({
        runId: 'silent-run',
        phase: 'failed',
        error: expect.stringMatching(/no output/),
      })
      await expect(error).resolves.toMatchObject({message: expect.stringMatching(/no output/)})
    })
  })

  describe('context meter', () => {
    it('the meter reads the last assistant usage in the transcript, not the sum of the turn', async () => {
      const sessionId = await newSession()
      cli.usage.push({...usage(1_000), promptTokensDetails: {cachedTokens: 400}})
      await turnWithTranscript(sessionId, 'context', 1, 'context', contextUsageLines())
      expect((await sessionMeta(sessionId)).usage).toMatchObject({
        inputTokens: 1_000,
        cacheReadTokens: 400,
        contextTokens: 320,
      })
    })
  })

  describe('sessions', () => {
    it('opening without an id reopens the latest chat session and never one made for an agent', async () => {
      const latest = await newSession()
      await finished(latest, 'make it the latest')
      await headerMcpCall({})
      expect((await kit().rpc.sessions.resolve({})).sessionId).toBe(latest)
    })

    it('opening by id keeps ours, creates an unknown one, and adopts a CLI or agent session exactly once', async () => {
      const ours = await newSession()
      expect((await kit().rpc.sessions.resolve({id: ours})).sessionId).toBe(ours)
      expect((await kit().rpc.sessions.resolve({id: UNKNOWN_SESSION})).sessionId).toBe(UNKNOWN_SESSION)
      const adopted = (await kit().rpc.sessions.resolve({id: 'native-adopt-1'})).sessionId
      expect((await kit().rpc.sessions.resolve({id: 'native-adopt-1'})).sessionId).toBe(adopted)
      const adoptedStream = await kit().events(adopted)
      await headerMcpCall({[CONCIV_CLAUDE_SESSION_HEADER]: 'native-adopt-1'})
      await adoptedStream.waitFor((chunk) => chunk.type === ChatEventType.TOOL_CALL_RESULT, GUARD)
      await headerMcpCall({[CONCIV_CLAUDE_SESSION_HEADER]: 'agent-native-1'})
      await headerMcpCall({[CONCIV_CLAUDE_SESSION_HEADER]: 'agent-native-1'})
      const listed = await kit().rpc.sessions.list({includeHidden: true})
      expect(listed.filter((meta) => meta.native?.nativeId === 'agent-native-1')).toHaveLength(1)
    })

    it('the session list titles, renames, refuses bad input, and forgets deleted sessions', async () => {
      const [kept, removed] = [await newSession(), await newSession()]
      expect((await kit().rpc.markers.list({sessionId: kept})).map((marker) => marker.kind)).toEqual(['new'])
      await finished(kept, 'title from me')
      await finished(removed, 'clear me')
      expect(await sessionMeta(kept)).toMatchObject({origin: 'conciv', title: 'title from me'})
      await kit().rpc.sessions.rename({sessionId: kept, title: '  renamed  '})
      expect((await sessionMeta(kept)).title).toBe('renamed')
      await expect(kit().rpc.sessions.rename({sessionId: NEVER_MADE, title: 'x'})).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      await expect(kit().rpc.sessions.model({sessionId: kept, model: 'no-such-model'})).rejects.toMatchObject({
        code: 'UNKNOWN_MODEL',
      })
      await kit().rpc.sessions.delete({sessionId: removed})
      expect((await kit().rpc.sessions.list(undefined)).map((meta) => meta.id)).not.toContain(removed)
      expect(await thread(removed)).toEqual([])
      expect(await userTexts(kept)).toEqual(['title from me'])
    })
  })

  describe('code mode', () => {
    it('a turn and agents over MCP get the same tools: run code, discover tools, and the asking tools', async () => {
      const sessionId = await newSession()
      await finished(sessionId, 'tools')
      const offered = await app.mcpTools()
      for (const names of [lastRunOf(sessionId).tools, offered.map((tool) => tool.name)]) {
        expect(names).toEqual(expect.arrayContaining(['execute_typescript', 'discover_tools', 'fixture_ask']))
        expect(names).not.toContain('fixture_echo')
      }
      const description = offered.find((tool) => tool.name === 'execute_typescript')?.description ?? ''
      expect(description).toContain('discover_tools')
      expect(description).not.toContain('fixture_echo')
    })

    it('code reaches every capability by name, returns values and logs, and keeps each run isolated', async () => {
      expect(await executeResult('return 1 + 1')).toBe(2)
      expect(await executeResult('return await external_fixture_echo({text: "bound"})')).toEqual({echoed: 'bound'})
      expect(await executeResult('return typeof external_conciv_extensions')).toBe('function')
      expect(await runTypescript('console.log("logged line"); return 5')).toMatchObject({
        result: 5,
        logs: ['logged line'],
      })
      await executeResult('globalThis.leak = 41; return 1')
      expect(await executeResult('return typeof globalThis.leak')).toBe('undefined')
      expect(JSON.stringify(await (await mcpTool('discover_tools')).execute({toolNames: ['fixture_echo']}))).toContain(
        'fixture_echo',
      )
    })

    it('errors keep their declared code, other failures stay plain errors, and huge results are capped', async () => {
      expect(await executeResult(catchMessage('external_fixture_fail({spaced: true})'))).toBe(DECLARED_MESSAGE)
      expect(await executeResult(catchMessage('external_fixture_fail({spaced: false})'))).toBe(DECLARED_MESSAGE)
      await expect(runTypescript('await external_fixture_fail({spaced: true})')).rejects.toThrow(/"code":"PROBE_BROKE"/)
      const undeclared = await runTypescript('throw new Error("EACCES: denied")').catch((error: unknown) =>
        String(error),
      )
      expect(String(undeclared)).toContain('EACCES: denied')
      expect(String(undeclared)).not.toContain('"code":"EACCES"')
      const capped = JSON.stringify(await runTypescript('return "y".repeat(200000)'))
      expect(capped.length).toBeLessThan(60_000)
      expect(capped).toContain('conciv:truncated')
    })
  })

  describe('code mode child cards', () => {
    it('each call in a script shows as its own card under the script, with results, errors and caps, after reload too', async () => {
      const sessionId = await newSession()
      const ran = toolRuns.echo
      const parent = codeTurn(CHILD_CARD_SCRIPT)
      await finished(sessionId, 'many calls')
      await finished(sessionId, 'a later turn')
      expect(toolRuns.echo).toBe(ran + 2)
      const children = toolCallParts(await thread(sessionId)).filter((part) => part.name !== 'execute_typescript')
      expect(children.map((part) => [part.name, cardMetadata(part)])).toEqual(
        CHILD_CARDS.map((name) => [name, {parentToolCallId: parent}]),
      )
      expect(children.find((part) => part.name === 'fixture_fail')?.state).toBe('error')
      const results = resultsOf(await thread(sessionId))
      expect(results).toContain('the probe broke')
      expect(results).toContain('conciv:truncated')
      expect(results).toContain('120000')
    })
  })

  describe('questions to the user', () => {
    it('a question waits for the widget answer, a late viewer sees it, and an unknown answer is refused', async () => {
      script().holdResults()
      const [uiCallId] = script().scriptTurn({toolCalls: [{name: 'mcp__conciv__conciv_ui', input: {kind: 'confirm'}}]})
      const turn = await send(app.mcpSession, 'ask the user', {runId: 'ui-run'})
      await turn.waitFor(isUiCall, GUARD)
      const answer = executeResult('return await external_conciv_ui({kind: "confirm", question: "Proceed?"})')
      await kit().join('ui-run').waitFor(isUiCall, GUARD)
      await kit().rpc.chat.uiReply({sessionId: app.mcpSession, toolCallId: uiCallId ?? '', value: 'yes'})
      expect(await answer).toEqual({answered: true, value: 'yes'})
      await expect(
        kit().rpc.chat.uiReply({sessionId: app.mcpSession, toolCallId: 'no-such-call', value: 'yes'}),
      ).rejects.toMatchObject({code: 'UNKNOWN_REQUEST'})
      script().releaseResults()
      await turn.done(GUARD)
    })
  })

  describe('page tools', () => {
    it('a page tool reaches the page without an ask and its change lands in the page journal', async () => {
      const sessionId = await kit().session()
      codeTurn('return await external_page_click({selector: "#go"})')
      const events = await finished(sessionId, 'click')
      expect(events.custom('approval-requested')).toEqual([])
      expect(widget().seen()).toContain('page_click')
      expect((await kit().rpc.page.changes(undefined)).length).toBeGreaterThan(0)
    })
  })

  describe('transport and workspace', () => {
    it('a turn over SSE stores the same thread as one over the socket, and nothing lands in the project', async () => {
      const [overSocket, overSse] = [await newSession(), await newSession()]
      await finished(overSocket, 'same')
      await readSse(await sseTurn(overSse, 'sse-run', 'same', new AbortController().signal), ChatEventType.RUN_FINISHED)
      expect(roleTexts(await thread(overSse))).toEqual(roleTexts(await thread(overSocket)))
      expect(readdirSync(kit().stateRoot).filter((name) => ['.mcp.json', '.claude'].includes(name))).toEqual([])
    })
  })

  describe('server restart', () => {
    it('the turn clock survives the server restarting', async () => {
      const sessionId = await newSession()
      await finished(sessionId, 'timed', {runId: 'timed-run'})
      const before = (await kit().hydrate(sessionId)).lastRun
      await kit().restartServer()
      expect((await kit().hydrate(sessionId)).lastRun).toEqual({...before, serverNow: expect.any(Number)})
    })
  })
})

const SILENCE_MS = 1_000
const GUARD = {hangGuardMs: 5_000}
const FIXTURE_MIME = 'application/x-conciv-fixture'
const BROKEN_MIME = 'application/x-conciv-broken'
const ASK_ID = 'conciv:tool:fixture_ask'
const PLAIN_COMMAND = 'claude-code:command:git status'
const HIDDEN_COMMAND = 'claude-code:command:grep "$(cat x)"'
const TERMINAL_ID = 'sess-terminal-born'
const UNKNOWN_SESSION = 'conciv_unknown-but-valid'
const NEVER_MADE = 'conciv_never-made'
const DECLARED_MESSAGE = 'PROBE_BROKE: the probe broke'
const FIXTURE_TOOLS = ['fixture_echo', 'fixture_read', 'fixture_ask']
const CHILD_CARDS = ['fixture_echo', 'fixture_echo', 'fixture_fail', 'fixture_huge']
const ECHO_DESCRIPTION = 'Echo the text back.\n\nUse it to echo.\n\nNever echo secrets.\n\nKeep it short.'
const EXPANSION_PART = {type: 'text', content: 'fixture-expanded', metadata: {modelOnly: true}}
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const IMAGE = {type: 'image', source: {type: 'data', mimeType: 'image/png', value: ONE_PIXEL_PNG}}
const TOOL_NAME_FORMS: [string, string][] = [
  ['mcp__conciv__fixture_echo', 'fixture_echo'],
  ['tanstack_fixture_echo', 'fixture_echo'],
  ['mcp__tanstack__conciv_ui', 'conciv_ui'],
  ['Read', 'Read'],
  ['unknown_tool', 'unknown_tool'],
  ['fixture.echo', 'fixture.echo'],
  ['fixture_ech', 'fixture_ech'],
]
const TOOLS_WITHOUT_ASK_SCRIPT =
  'return [await external_fixture_echo({text: "hi"}), await external_fixture_read({}), typeof external_fixture_ask]'
const CHILD_CARD_SCRIPT = `
  await external_fixture_echo({text: "a"})
  await external_fixture_echo({text: "b"})
  try { await external_fixture_fail({spaced: true}) } catch {}
  const huge = await external_fixture_huge({})
  return huge.blob.length
`
const SseChunkSchema = z.object({type: z.string()}).loose()
const ResultEnvelopeSchema = z.object({result: z.unknown(), logs: z.array(z.string()).default([])}).loose()

type SeenRun = {
  sessionId: string
  kind: 'chat' | 'compact'
  model: string | undefined
  resumeSessionId: string | null
  messages: string
  tools: string[]
  approvals: string[]
  startedAt: number
  endedAt: number | null
}

type TurnInput = string | Record<string, unknown>

type SharedApp = {
  kit: Kit | null
  harness: TestHarness | null
  widget: FakeWidget | null
  mcp: McpClient | null
  mcpSession: string
  claudeHome: string
  mcpTools: () => Promise<McpTool[]>
}

const app: SharedApp = {
  kit: null,
  harness: null,
  widget: null,
  mcp: null,
  mcpSession: '',
  claudeHome: '',
  mcpTools: async () => {
    if (app.mcp === null) throw new Error('the MCP client is not connected')
    return app.mcp.tools()
  },
}
const seenRuns: SeenRun[] = []
const cli: {usage: TokenUsage[]; launchFailures: string[]} = {usage: [], launchFailures: []}
const toolRuns = {ask: 0, echo: 0}
const turnEnds: string[] = []
const turnEndWaiters: {sessionId: string; settle: () => void}[] = []

function fixtureExtension() {
  return defineExtension({
    name: 'fixture',
    tools: [echoTool(), readTool(), askTool(), failTool(), hugeTool()],
    attachments: fixtureAttachments(),
  }).server(() => ({context: {}, turnEnd: noteTurnEnd}))
}

function echoTool() {
  return defineTool({
    name: 'fixture_echo',
    description: 'Echo the text back.',
    inputSchema: z.object({text: z.string()}),
    outputSchema: z.object({echoed: z.string()}),
    promptSnippet: 'Use it to echo.',
    promptGuidelines: ['Never echo secrets.', 'Keep it short.'],
    meta: {summary: 'echo the text back', category: 'fixture', mutating: true},
  }).server((input) => {
    toolRuns.echo += 1
    return {echoed: input.text}
  })
}

function readTool() {
  return defineTool({
    name: 'fixture_read',
    description: 'Read a fixture value.',
    inputSchema: z.object({}),
    outputSchema: z.object({value: z.number()}),
    meta: {summary: 'read a fixture value', category: 'fixture', mutating: false},
  }).server(() => ({value: 7}))
}

function askTool() {
  return defineTool({
    name: 'fixture_ask',
    description: 'A risky fixture action.',
    inputSchema: z.object({target: z.string()}),
    outputSchema: z.object({done: z.string()}),
    meta: {summary: 'a risky fixture action', category: 'fixture', mutating: false},
    approval: 'ask',
  }).server((input) => {
    toolRuns.ask += 1
    return {done: input.target}
  })
}

function failTool() {
  return defineTool({
    name: 'fixture_fail',
    description: 'Fail with a declared error.',
    inputSchema: z.object({spaced: z.boolean()}),
    outputSchema: z.object({}),
    errors: {PROBE_BROKE: {message: 'the probe broke'}},
    meta: {summary: 'fail with a declared error', category: 'fixture', mutating: false},
  }).server((input) => {
    throw toolError('PROBE_BROKE', {message: input.spaced ? 'the probe broke' : 'PROBE_BROKE:the probe broke'})
  })
}

function hugeTool() {
  return defineTool({
    name: 'fixture_huge',
    description: 'Return a huge value.',
    inputSchema: z.object({}),
    outputSchema: z.object({blob: z.string()}),
    meta: {summary: 'return a huge value', category: 'fixture', mutating: false},
  }).server(() => ({blob: 'x'.repeat(120_000)}))
}

function fixtureAttachments() {
  const expanding = defineAttachment({mime: FIXTURE_MIME})
  expanding.server(() => [{type: 'text', content: 'fixture-expanded'}])
  const broken = defineAttachment({mime: BROKEN_MIME})
  broken.server(() => {
    throw new Error('the expander broke')
  })
  return [expanding, broken]
}

function noteTurnEnd(sessionId: string): void {
  turnEnds.push(sessionId)
  const ready = turnEndWaiters.filter((waiter) => waiter.sessionId === sessionId)
  turnEndWaiters.splice(0, turnEndWaiters.length, ...turnEndWaiters.filter((waiter) => !ready.includes(waiter)))
  ready.forEach((waiter) => waiter.settle())
}

function nextTurnEnd(sessionId: string): Promise<void> {
  return new Promise((settle, fail) => {
    const guard = setTimeout(() => fail(new Error(`the run-end hook did not fire for ${sessionId} within 3s`)), 3_000)
    turnEndWaiters.push({
      sessionId,
      settle: () => {
        clearTimeout(guard)
        settle()
      },
    })
  })
}

function recordingHarness(base: TestHarness): TestHarness {
  return {
    ...base,
    chatConfig: (deps: HarnessChatDeps) => {
      const failure = cli.launchFailures.shift()
      if (failure !== undefined) throw new Error(failure)
      return {
        adapter: makeTextAdapter('scripted', async function* (options) {
          const seen: SeenRun = {
            sessionId: deps.sessionId,
            kind: deps.kind,
            model: deps.model,
            resumeSessionId: deps.resumeSessionId,
            messages: JSON.stringify(options.messages),
            tools: (options.tools ?? []).map((tool) => tool.name),
            approvals: [...(options.approvals?.keys() ?? [])],
            startedAt: Date.now(),
            endedAt: null,
          }
          seenRuns.push(seen)
          const reported = cli.usage.shift()
          try {
            for await (const chunk of base.script.chatStream(deps, options)) yield withUsage(chunk, reported)
          } finally {
            seen.endedAt = Date.now()
          }
        }),
      }
    },
  }
}

function withUsage(chunk: ChatEvent, reported: TokenUsage | undefined): ChatEvent {
  if (reported === undefined || chunk.type !== ChatEventType.RUN_FINISHED || chunk.finishReason === 'tool_calls') {
    return chunk
  }
  return {...chunk, usage: reported}
}

function usage(promptTokens: number): TokenUsage {
  return {promptTokens, completionTokens: 1, totalTokens: promptTokens + 1}
}

function kit(): Kit {
  if (app.kit === null) throw new Error('the app did not boot')
  return app.kit
}

function script(): TestHarness['script'] {
  if (app.harness === null) throw new Error('the app did not boot')
  return app.harness.script
}

function widget(): FakeWidget {
  if (app.widget === null) throw new Error('the widget is not connected')
  return app.widget
}

async function newSession(): Promise<string> {
  return (await kit().rpc.sessions.create()).sessionId
}

function send(
  sessionId: string,
  input: TurnInput,
  opts: {runId?: string; messageId?: string} = {},
): Promise<RunStream> {
  return kit().turn(input, {session: sessionId, ...opts})
}

async function finished(sessionId: string, input: TurnInput, opts: {runId?: string; messageId?: string} = {}) {
  return (await send(sessionId, input, opts)).done(GUARD)
}

async function heldTurn(sessionId: string, text: string, runId?: string) {
  script().hold()
  const turn = await send(sessionId, text, runId === undefined ? {} : {runId})
  const seen = collect(turn)
  await turn.waitForText('ok')
  return {turn, seen}
}

async function joinedTurn(sessionId: string, round: number): Promise<void> {
  const runId = `load-${round}-${sessionId}`
  const turn = await send(sessionId, `round ${round}`, {runId})
  await turn.waitForRunStart()
  await kit().join(runId).done(GUARD)
  await turn.done(GUARD)
}

function askTurn(sessionId: string, runId?: string): Promise<RunEvents> {
  script().scriptToolCall('fixture_ask', {target: 'x'})
  return finished(sessionId, 'do the risky thing', runId === undefined ? {} : {runId})
}

function pendingAsk(runId: string) {
  return {approvalId: ASK_ID, toolCallId: expect.any(String), toolName: 'fixture_ask', input: {target: 'x'}, runId}
}

async function commandAsks(sessionId: string, approvalIds: string[]): Promise<void> {
  for (const approvalId of approvalIds) script().scriptCustomEvent('approval-requested', {approvalId, title: 'Bash'})
  await finished(sessionId, 'commands')
}

function decide(sessionId: string, approvalId: string, approved: boolean, scope: 'once' | 'session' = 'once') {
  return callerWith(sessionId).chat.permissionDecision({approvalId, approved, scope})
}

function callerWith(sessionId: string) {
  return makeRpcClient(kit().base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
}

function callerWithout() {
  return makeRpcClient(kit().base)
}

function mcpRpc() {
  return callerWith(app.mcpSession)
}

function codeTurn(code: string): string {
  return script().scriptToolCall('execute_typescript', {typescriptCode: code})
}

function catchMessage(call: string): string {
  return `try { await ${call} } catch (error) { return String(error.message) }`
}

async function sessionMeta(sessionId: string) {
  const meta = (await kit().rpc.sessions.list({includeHidden: true})).find((entry) => entry.id === sessionId)
  if (meta === undefined) throw new Error(`session ${sessionId} is not listed`)
  return meta
}

async function compactMarkers(sessionId: string): Promise<number[]> {
  const markers = await kit().rpc.markers.list({sessionId})
  return markers.filter((marker) => marker.kind === 'compact').map((marker) => marker.afterTurn)
}

async function thread(sessionId: string): Promise<ChatMessage[]> {
  return (await kit().hydrate(sessionId)).messages
}

async function userTexts(sessionId: string): Promise<string[]> {
  return (await thread(sessionId)).filter((message) => message.role === 'user').map(textOfParts)
}

async function assistantTexts(sessionId: string): Promise<string[]> {
  return (await thread(sessionId)).filter((message) => message.role === 'assistant').map(textOfParts)
}

function textOfParts(message: ChatMessage): string {
  return message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(' ')
}

function roleTexts(messages: ChatMessage[]): string[][] {
  return messages.map((message) => [message.role, textOfParts(message)])
}

function assistantIdsOf(events: RunEvents): string[] {
  return foldChatEvents(events.all)
    .filter((message) => message.role === 'assistant')
    .map((message) => message.id)
}

function assistantView(events: RunEvents) {
  return foldChatEvents(events.all)
    .filter((message) => message.role === 'assistant')
    .map((message) => ({id: message.id, parts: message.parts}))
}

function nonCustomTypes(events: RunEvents): string[] {
  return events.all.filter((chunk) => chunk.type !== ChatEventType.CUSTOM).map((chunk) => chunk.type)
}

function collect(stream: RunStream): ChatEvent[] {
  const seen: ChatEvent[] = []
  stream.tap((chunk) => seen.push(chunk))
  return seen
}

function count(events: RunEvents, type: ChatEvent['type']): number {
  return events.all.filter((chunk) => chunk.type === type).length
}

function runIdsOf(events: RunEvents, type: ChatEvent['type']): string[] {
  return events.all.flatMap((chunk) => (chunk.type === type && 'runId' in chunk ? [String(chunk.runId)] : []))
}

function runsOf(sessionId: string): SeenRun[] {
  return seenRuns.filter((run) => run.sessionId === sessionId)
}

function lastRunOf(sessionId: string): SeenRun {
  const run = runsOf(sessionId).at(-1)
  if (run === undefined) throw new Error(`no turn reached the CLI for ${sessionId}`)
  return run
}

function overlapping(runs: SeenRun[]): boolean {
  return runs.some((run, index) =>
    runs
      .slice(index + 1)
      .some((other) => run.startedAt < (other.endedAt ?? Infinity) && other.startedAt < (run.endedAt ?? Infinity)),
  )
}

function toolCallParts(messages: ChatMessage[]) {
  return messages.flatMap((message) => message.parts.flatMap((part) => (part.type === 'tool-call' ? [part] : [])))
}

function cardMetadata(part: ReturnType<typeof toolCallParts>[number] | undefined): unknown {
  return part !== undefined && 'metadata' in part ? part.metadata : undefined
}

function resultsOf(messages: ChatMessage[]): string {
  return messages
    .flatMap((message) => message.parts.flatMap((part) => (part.type === 'tool-result' ? [part.content] : [])))
    .join('\n')
}

function isExpansion(part: ChatMessage['parts'][number]): boolean {
  return part.type === 'text' && part.content === 'fixture-expanded'
}

function isTurnBoundary(chunk: ChatEvent): boolean {
  return chunk.type === ChatEventType.RUN_STARTED || chunk.type === ChatEventType.RUN_FINISHED
}

function isUiCall(chunk: ChatEvent): boolean {
  return chunk.type === ChatEventType.TOOL_CALL_START && chunk.toolCallName.endsWith('conciv_ui')
}

function isResultFor(chunk: ChatEvent, text: string): boolean {
  return chunk.type === ChatEventType.TOOL_CALL_RESULT && JSON.stringify(chunk).includes(text)
}

function readCall() {
  return {name: 'Read', input: {file_path: 'a.ts'}, result: {text: 'a'}}
}

function bashCall() {
  return {name: 'Bash', input: {command: 'ls'}}
}

function attachmentParts() {
  return [
    {type: 'text', content: 'why?'},
    {type: 'document', source: {type: 'data', mimeType: FIXTURE_MIME, value: 'eyJpZCI6MX0='}},
    {type: 'document', source: {type: 'data', mimeType: 'application/x-unknown', value: 'eA=='}},
    {type: 'document', source: {type: 'data', mimeType: BROKEN_MIME, value: 'eA=='}},
  ]
}

function answerFor(name: string): PageOutcome {
  if (name === 'page_click') return {ok: true, result: {ok: true}}
  return {ok: true, result: {text: 'page-ok'}}
}

async function capturingConsole<T>(work: () => Promise<T>): Promise<{result: T; lines: string[]}> {
  const lines: string[] = []
  const original = {error: console.error, warn: console.warn}
  const capture = (...args: unknown[]): void => {
    lines.push(args.map(String).join(' '))
  }
  console.error = capture
  console.warn = capture
  try {
    return {result: await work(), lines}
  } finally {
    console.error = original.error
    console.warn = original.warn
  }
}

function sseTurn(sessionId: string, runId: string, text: string, signal: AbortSignal): Promise<Response> {
  return fetch(`${kit().base}${CHAT_SSE_PATH}`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      threadId: sessionId,
      runId,
      messages: [{id: `${runId}-user`, role: 'user', content: text}],
      tools: [],
      context: [],
    }),
    signal,
  })
}

async function leaveAfterFirstText(sessionId: string, runId: string): Promise<void> {
  const viewer = new AbortController()
  await readSse(await sseTurn(sessionId, runId, 'nobody watches', viewer.signal), ChatEventType.TEXT_MESSAGE_CONTENT)
  viewer.abort()
}

async function readSse(response: Response, until: string): Promise<string[]> {
  const body = response.body
  if (body === null) throw new Error('the SSE response has no body')
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  const seen: string[] = []
  const buffer = {text: ''}
  for (;;) {
    const next = await reader.read()
    if (next.done) return seen
    buffer.text += next.value
    const frames = buffer.text.split('\n\n')
    buffer.text = frames.pop() ?? ''
    const types = frames
      .flatMap((frame) => frame.split('\n'))
      .flatMap((line) => (line.startsWith('data: ') ? [SseChunkSchema.safeParse(JSON.parse(line.slice(6)))] : []))
      .flatMap((parsed) => (parsed.success ? [parsed.data.type] : []))
    seen.push(...types)
    if (types.includes(until)) {
      await reader.cancel()
      return seen
    }
  }
}

function fakeNativeId(sessionId: string): string {
  return `fake-${sessionId}`
}

function transcriptPathOf(nativeId: string): string {
  return requireTranscriptPath(requireClaude())(kit().stateRoot, HarnessSessionId.parse(nativeId), app.claudeHome)
}

function writeTranscript(nativeId: string, lines: string[]): string {
  const path = transcriptPathOf(nativeId)
  mkdirSync(dirname(path), {recursive: true})
  writeFileSync(path, lines.join('\n'))
  return path
}

function writeOutsideProject(lines: string[]): string {
  const outside = join(kit().stateRoot, '..', 'secret.jsonl')
  writeFileSync(outside, lines.join('\n'))
  return outside
}

function existingTranscript(nativeId: string): string[] {
  const path = transcriptPathOf(nativeId)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split('\n').filter(Boolean)
}

async function turnWithTranscript(
  sessionId: string,
  input: TurnInput,
  index: number,
  cliText = typeof input === 'string' ? input : '',
  extra: string[] = [],
): Promise<string> {
  script().hold()
  const turn = await send(sessionId, input)
  await turn.waitForText('ok')
  const nativeId = fakeNativeId(sessionId)
  const lines = [...existingTranscript(nativeId), ...transcriptTurn(cliText, 'ok', index), ...extra]
  const path = writeTranscript(nativeId, lines)
  script().release()
  await turn.done(GUARD)
  return path
}

function transcriptLine(role: 'user' | 'assistant', text: string, uuid: string, used?: Record<string, number>) {
  return JSON.stringify({
    type: role,
    uuid,
    message: {id: uuid, role, content: [{type: 'text', text}], ...(used === undefined ? {} : {usage: used})},
  })
}

function transcriptTurn(prompt: string, reply: string, index: number): string[] {
  return [transcriptLine('user', prompt, `rec-u-${index}`), transcriptLine('assistant', reply, `rec-a-${index}`)]
}

function terminalTurns(prompts: string[], firstIndex = 0): string[] {
  return prompts.flatMap((prompt, index) => transcriptTurn(prompt, `reply ${index}`, firstIndex + index))
}

function contextUsageLines(): string[] {
  return [
    transcriptLine('assistant', 'early', 'ctx-a1', {input_tokens: 100, cache_read_input_tokens: 10}),
    transcriptLine('assistant', 'late', 'ctx-a2', {input_tokens: 300, cache_read_input_tokens: 20}),
  ]
}

async function mcpTool(name: string): Promise<McpTool> {
  const tool = (await app.mcpTools()).find((entry) => entry.name === name)
  if (tool === undefined) throw new Error(`${name} is not on /api/mcp`)
  return tool
}

async function runTypescript(code: string): Promise<unknown> {
  const reply = await (await mcpTool('execute_typescript')).execute({typescriptCode: code})
  return typeof reply === 'string' ? JSON.parse(reply) : reply
}

async function executeResult(code: string): Promise<unknown> {
  return ResultEnvelopeSchema.parse(await runTypescript(code)).result
}

async function headerMcpCall(headers: Record<string, string>): Promise<void> {
  const client = await connectMcpClient(`${kit().base}/api/mcp`, headers)
  await (await client.tools()).find((tool) => tool.name === 'execute_typescript')?.execute({typescriptCode: 'return 1'})
  await client.close()
}

function mcpPost(headers: Record<string, string>): Promise<Response> {
  return fetch(`${kit().base}/api/mcp`, {
    method: 'POST',
    headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'}),
  })
}
