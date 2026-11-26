import {createORPCClient} from '@orpc/client'
import {createFakeEngine, type FakeEngine, type FakeEngineOptions} from '@conciv/client/testing'
import type {RpcClient} from '@conciv/client'
import type {SessionMeta} from '@conciv/protocol'
import {
  SessionId,
  type ChatCommand,
  type ChatModels,
  type HarnessMenuEntry,
  type HarnessModelInfo,
} from '@conciv/types/chat-types'
import {Command, ComposerPill, Plugin} from '@conciv/frontend-plugin-api'
import {shellEngine, type ShellPlugin} from './mount-shell.js'

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

export type ComposerHarness = {
  readonly id: string
  readonly name: string
  readonly models: readonly HarnessModelInfo[]
}

export const ENGINE_HARNESS: ComposerHarness = {id: 'fake', name: 'engine', models: ENGINE_MODELS}

export function harnessModels(harness: ComposerHarness): ChatModels {
  return {
    models: [...harness.models],
    defaultModel: harness.models[0]?.id ?? null,
    modelsFailed: false,
    harness: {id: harness.id, name: harness.name, imageInput: false, persistentPty: false},
    login: {loggedIn: true},
  }
}

export function harnessEntry(harness: ComposerHarness): HarnessMenuEntry {
  const models = harnessModels(harness)
  return {
    ...models.harness,
    models: models.models,
    defaultModel: models.defaultModel,
    modelsFailed: false,
    login: models.login,
  }
}

export type ComposerEngineOptions = Omit<FakeEngineOptions, 'models'> & {
  readonly harness?: ComposerHarness
  readonly commands?: readonly ChatCommand[]
}

export function composerEngine(options: ComposerEngineOptions = {}): FakeEngine {
  const {harness = ENGINE_HARNESS, commands = ENGINE_COMMANDS, handlers, ...rest} = options
  return shellEngine(
    createFakeEngine({
      ...rest,
      models: harnessModels(harness),
      handlers: {
        ...handlers,
        meta: {commands: () => ({commands: [...commands]}), ...handlers?.meta},
      },
    }),
  )
}

export function sentTexts(engine: FakeEngine): string[] {
  return engine
    .sent()
    .map((send) =>
      (send.messages.at(-1)?.parts ?? []).flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(''),
    )
}

export function sentJson(engine: FakeEngine): string[] {
  return engine.sent().map((send) => JSON.stringify(send.messages.at(-1)))
}

export function readSession(engine: FakeEngine, sessionId: string): Promise<SessionMeta> {
  return createORPCClient<RpcClient>(engine.connection.link).sessions.get({sessionId})
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

export function elsewhereSession() {
  const meta: SessionMeta = {
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
  }
  return {
    ...meta,
    excerpt: 'the billing totals are wrong',
    matched: [],
    cwd: '/elsewhere/billing-app',
    resume: null,
    preview: null,
  }
}

function closeButton(close: () => void): HTMLButtonElement {
  const button = Object.assign(document.createElement('button'), {type: 'button', textContent: 'Done'})
  button.addEventListener('click', () => close())
  return button
}

export const reviewNotesPlugin: ShellPlugin = {
  id: 'review-notes',
  plugin: Plugin.define({
    setup(ctx) {
      ctx.add(Command, {
        id: 'review',
        title: 'Review',
        description: 'Review a part of the page',
        slash: {name: 'review', arguments: true},
        run: (input) => {
          ctx.toast.show({title: `Reviewing ${input}`, persistent: true})
        },
      })
      ctx.add(Command, {
        id: 'summary',
        title: 'Summary',
        description: 'Sum up the review',
        slash: {name: 'summary', after: 'model'},
        run: () => {
          ctx.toast.show({title: 'Summary ready', persistent: true})
        },
      })
      ctx.add(ComposerPill, {
        id: 'review',
        order: 3,
        show: (input) => ({
          label: 'Review',
          run: () => {
            input.screen.composer.attach({
              type: 'note',
              origin: 'review',
              commentId: 'header',
              label: 'Header',
              icon: 'message-square',
              subject: 'the page header',
              comment: 'Make the header sticky',
            })
            input.screen.composer.focus()
          },
        }),
      })
      ctx.add(ComposerPill, {
        id: 'checks',
        order: 1,
        show: (input) =>
          input.screen.composer.text() === ''
            ? {
                label: 'Checks',
                rows: [
                  {
                    id: 'lint',
                    label: 'Lint failed',
                    tone: 'danger',
                    run: () => input.screen.composer.insert('Fix lint'),
                  },
                ],
              }
            : undefined,
      })
      ctx.add(ComposerPill, {
        id: 'status',
        order: 2,
        show: () => ({label: 'Status', title: 'Deploy status'}),
        menu: (input) => {
          const content = document.createElement('div')
          content.append(
            Object.assign(document.createElement('p'), {textContent: 'Staging is green'}),
            closeButton(() => input.close()),
          )
          return content
        },
      })
    },
  }),
}
