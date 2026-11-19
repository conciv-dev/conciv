import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import {
  createFakeHarness,
  createTestkit,
  type FakeHarness,
  type FixtureSession,
  type Kit,
} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'
import {resolveConfig} from '@conciv/core/config'
import type {CoreRuntime, SessionScope} from '@conciv/core/runtime'
import type {SessionId} from '@conciv/protocol/chat-types'
import type * as Bundler from '@conciv/plugin/schema/bundler'
import type {
  HarnessCapabilities,
  HarnessCommand,
  HarnessConnectContext,
  HarnessModel,
} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'
import type {EngineStaleness} from '@conciv/contract'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {ConcivConfig} from '@conciv/protocol/config-types'

export type EditorOpen = {file: string; line?: number; column?: number}

export type CoreKit = Kit & {
  harness: FakeHarness
  editorOpened: () => ReadonlyArray<EditorOpen>
  forSession: (id: SessionId) => SessionScope
  home: string
  writeProjectFile: (path: string, content: string) => void
}

export type AlternateHarness = {
  id: string
  displayName: string
  text?: string
  models?: HarnessModel[]
  commands?: HarnessCommand[]
}

export async function bootCoreKit(
  opts: Pick<ConcivConfig, 'permission' | 'permissions'> & {
    id: string
    text?: string
    resume?: boolean
    displayName?: string
    models?: HarnessModel[]
    commands?: HarnessCommand[]
    history?: FixtureSession[]
    resumeBin?: string
    imageInput?: HarnessCapabilities['imageInput']
    alternates?: AlternateHarness[]
    allowedOrigins?: string[]
    staleness?: () => EngineStaleness
    nativePageDir?: string
    plugins?: NonNullable<ConcivConfig['plugins']>
    files?: Readonly<Record<string, string>>
    stateRoot?: string
    bundler?: Bundler.BundlerBridge
    pageReplyTimeoutMs?: number
    tty?: {command(context: HarnessConnectContext): TtyCommand}
  },
): Promise<CoreKit> {
  const harness = createFakeHarness({
    id: opts.id,
    text: opts.text ?? 'Hello from conciv',
    ...(opts.resume ? {resume: true} : {}),
    ...(opts.displayName ? {displayName: opts.displayName} : {}),
    models: opts.models,
    commands: opts.commands,
    history: opts.history,
    resumeBin: opts.resumeBin,
    imageInput: opts.imageInput,
    tty: opts.tty,
  })
  const captured: {runtime?: CoreRuntime} = {}
  const editorOpens: EditorOpen[] = []
  const kit = await createTestkit(
    harness,
    async (env) => {
      for (const [path, content] of Object.entries(opts.files ?? {})) writeInside(env.cwd, path, content)
      const {fetch, dispose, runtime, agentToken, awaitActivation} = await makeApp({
        print: env.print,
        cfg: {
          enabled: true,
          stateRoot: env.stateRoot,
          harness: env.harness.id,
          harnessBin: undefined,
          sessionId: undefined,
          harnessSessionId: undefined,
          systemPrompt: '',
          hubAccess: 'project',
          plugins: opts.plugins ?? [],
          policies: [],
          permissions: resolveConfig({permission: opts.permission, permissions: opts.permissions}, env.cwd).permissions,
        },
        cwd: env.cwd,
        openInEditor: (file, line, column) => {
          editorOpens.push({file, ...(line === undefined ? {} : {line}), ...(column === undefined ? {} : {column})})
        },
        harness: env.harness,
        harnesses: (opts.alternates ?? []).map((alternate) => createFakeHarness(alternate)),
        allowedOrigins: opts.allowedOrigins,
        staleness: opts.staleness,
        nativePageDir: opts.nativePageDir,
        home: kitHome(env.stateRoot),
        bridge: opts.bundler,
        pageReplyTimeoutMs: opts.pageReplyTimeoutMs,
      })
      captured.runtime = runtime
      await awaitActivation()
      return {
        fetch,
        dispose,
        agentToken,
      }
    },
    {stateRoot: opts.stateRoot},
  ).setup()
  const runtime = captured.runtime
  if (!runtime) throw new Error('the core kit booted without capturing the core runtime')
  return {
    ...kit,
    harness,
    editorOpened: () => editorOpens,
    forSession: runtime.forSession,
    home: kitHome(kit.stateRoot),
    writeProjectFile: (path, content) => writeInside(kit.stateRoot, path, content),
  }
}

function writeInside(root: string, path: string, content: string): void {
  const target = resolve(root, path)
  const inside = relative(root, target)
  if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`the project file ${path} resolves outside the project root ${root}`)
  }
  mkdirSync(dirname(target), {recursive: true})
  writeFileSync(target, content)
}

function kitHome(stateRoot: string): string {
  return join(concivStateDir(stateRoot), 'home')
}
