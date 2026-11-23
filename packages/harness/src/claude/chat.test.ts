import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {SessionId} from '@conciv/protocol/chat-types'
import {FILE_REF_PREFIX, type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {claudeChatConfig, claudeExecutable} from './chat.js'

describe('preparing a turn', () => {
  it('Compact sends /compact, an image part becomes an @file ref to a file written in the project tmp, the CLI only pre-allows the conciv bridge and never offers its own AskUserQuestion, MCP calls get an hour unless the caller says otherwise, and a CLI path with whitespace is refused', async () => {
    const project = tempDir('claude-chat-')
    const deps: HarnessChatDeps = {
      cwd: project,
      sessionId: SessionId.parse('conciv_session_1'),
      askPermission: async () => ({allowed: true}),
      resumeSessionId: null,
      env: {},
      kind: 'chat',
    }
    const pixel = Buffer.from('a png pixel')

    const compacted = await (
      await claudeChatConfig({...deps, kind: 'compact'})
    ).prepareMessages?.([
      {role: 'user', content: 'Fix the login button'},
      {role: 'assistant', content: 'The button now submits'},
      {role: 'user', content: 'Summarise'},
    ])
    const attached = await (
      await claudeChatConfig(deps)
    ).prepareMessages?.([
      {
        role: 'user',
        content: [
          {type: 'text', content: 'What is wrong here?'},
          {type: 'image', source: {type: 'data', mimeType: 'image/png', value: pixel.toString('base64')}},
        ],
      },
    ])
    const refs = attached?.at(-1)?.content
    const refText = Array.isArray(refs) ? refs.at(-1) : undefined
    const refPath = refText?.type === 'text' ? refText.content.slice(`${FILE_REF_PREFIX} @`.length) : ''

    expect(compacted).toEqual([
      {role: 'user', content: 'Fix the login button'},
      {role: 'assistant', content: 'The button now submits'},
      {role: 'user', content: '/compact'},
    ])
    expect(refText).toEqual({
      type: 'text',
      content: expect.stringMatching(
        new RegExp(
          `^${RegExp.escape(`${FILE_REF_PREFIX} @${join(project, '.conciv', 'tmp', 'img-')}`)}[0-9a-f-]+\\.png$`,
        ),
      ),
    })
    expect(readFileSync(refPath)).toEqual(pixel)
    expect(Reflect.get((await claudeChatConfig(deps)).adapter, 'adapterConfig')).toMatchObject({
      allowedTools: ['mcp__tanstack'],
      disallowedTools: ['AskUserQuestion'],
      env: {MCP_TOOL_TIMEOUT: '3600000'},
    })
    expect(
      Reflect.get((await claudeChatConfig({...deps, env: {MCP_TOOL_TIMEOUT: '999000'}})).adapter, 'adapterConfig'),
    ).toMatchObject({env: {MCP_TOOL_TIMEOUT: '999000'}})
    expect(() => claudeExecutable('/x/plug ins')).toThrow('contains whitespace')
    expect(() => claudeExecutable(null, '/t/my settings.json')).toThrow('contains whitespace')
  })
})
