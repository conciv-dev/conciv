import type {FakeHarness, FakeSession} from '@conciv/client/testing'
import type {SessionHit} from '@conciv/protocol'
import type {ChatMessage} from '@conciv/types/chat-message-types'
import {SessionId, type ChatCommand, type HarnessModelInfo} from '@conciv/types/chat-types'

const EFFORTS: NonNullable<HarnessModelInfo['efforts']> = ['low', 'medium', 'high', 'xhigh', 'max']

const ENGINE_MODELS: readonly HarnessModelInfo[] = [
  {id: 'opus', name: 'Opus 5.5', group: 'Claude', efforts: EFFORTS},
  {id: 'sonnet', name: 'Sonnet 5.5', group: 'Claude', efforts: EFFORTS},
  {id: 'claude-opus-4-7', name: 'Opus 4.7', group: 'Older versions', efforts: EFFORTS},
  {id: 'claude-haiku-4-5', name: 'Haiku 4.5', group: 'Older versions'},
]

const ENGINE_COMMANDS: readonly ChatCommand[] = [
  {name: 'model', description: 'Set the AI model', source: 'harness'},
  {name: 'deploy', description: 'Ship the branch', source: 'harness'},
]

export function harness(
  id: string,
  name: string,
  models: readonly HarnessModelInfo[],
  commands: readonly ChatCommand[] = [],
): FakeHarness {
  return {
    models: [...models],
    defaultModel: models[0]?.id ?? null,
    modelsFailed: false,
    harness: {id, name, imageInput: false, persistentPty: false},
    login: {loggedIn: true},
    commands,
  }
}

export const ENGINE_HARNESS = harness('fake', 'engine', ENGINE_MODELS, ENGINE_COMMANDS)

export function textMessage(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return {id, role, parts: [{type: 'text', content}]}
}

export function seededSession(exchanges: readonly number[]): FakeSession {
  return {
    id: 'ses_seeded',
    title: 'Seeded thread',
    messages: exchanges.flatMap((index) => [
      textMessage(`seeded-question-${index}`, 'user', `seeded exchange ${index}`),
      textMessage(`seeded-answer-${index}`, 'assistant', `seeded answer ${index}`),
    ]),
  }
}

export function mentionAgent(name: string, mode: 'subagent' | 'primary', description: string) {
  return {
    id: name,
    name,
    description,
    mode,
    hidden: false,
    permissions: [],
    request: {settings: {}, headers: {}, body: {}},
  }
}

export function elsewhereSession(): SessionHit {
  return {
    id: SessionId.parse('ses_billing'),
    title: 'Fix the billing page',
    updatedAt: 1_000,
    running: false,
    origin: 'conciv',
    usage: null,
    model: null,
    effort: null,
    hidden: false,
    native: null,
    harnessKind: 'fake',
    lastRunAt: null,
    excerpt: 'the billing totals are wrong',
    matched: [],
    cwd: '/elsewhere/billing-app',
    resume: null,
    preview: null,
  }
}

export const PANE_SESSION = 'ses_pane'

export const SESSION_ADDRESS = `/panel/${PANE_SESSION}?open=true`

export const MODEL: readonly HarnessModelInfo[] = [{id: 'fake-model', name: 'Fake model'}]
