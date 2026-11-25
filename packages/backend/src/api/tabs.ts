import {readFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {z} from 'zod'
import type {SessionMeta} from '@conciv/protocol'
import type {SessionId, TabOpen, Tabs} from '@conciv/types/chat-types'
import type {State} from '@conciv/plugin-page/rpc'
import {Effect} from 'effect'
import type {Log} from '../lib/logging.js'

type TabsDeps = {
  attachedSessions: () => Promise<SessionId[]>
  pageTabs: (sessionId: SessionId) => Promise<State>
  session: (sessionId: SessionId) => Promise<SessionMeta | null>
  root: string
  instructions: string
  log: Log
}

type BrowserTab = Tabs['tabs'][number]['browserTabs'][number]

const PackageNameSchema = z.object({name: z.string()})

const AbsentFileSchema = z.object({code: z.enum(['ENOENT', 'ENOTDIR', 'EISDIR'])})

const HEAD_REF = 'ref: refs/heads/'

const BranchSchema = z
  .string()
  .trim()
  .startsWith(HEAD_REF)
  .transform((head) => head.slice(HEAD_REF.length))

const GITDIR = 'gitdir: '

const GitdirSchema = z
  .string()
  .trim()
  .startsWith(GITDIR)
  .transform((line) => line.slice(GITDIR.length))

export function createTabs(deps: TabsDeps) {
  return {
    list: (): Promise<Tabs> => listTabs(deps),
    get: async (sessionId: SessionId): Promise<TabOpen> => ({
      open: (await deps.pageTabs(sessionId)).tabs.length > 0,
      instructions: deps.instructions === '' ? null : deps.instructions,
    }),
  }
}

async function listTabs(deps: TabsDeps): Promise<Tabs> {
  const open = await deps.attachedSessions()
  const [metas, pages, name, branch] = await Promise.all([
    Promise.all(open.map((sessionId) => deps.session(sessionId))),
    Promise.all(open.map((sessionId) => pageBrowserTabs(deps, sessionId))),
    projectName(deps.root, deps.log),
    gitBranch(deps.root, deps.log),
  ])
  const tabs = open.flatMap((sessionId, index) => {
    const meta = metas[index]
    if (meta === undefined || meta === null || meta.hidden) return []
    const browserTabs = pages[index] ?? []
    return [
      {
        sessionId,
        harness: meta.harnessKind,
        browserTabs,
        session: {title: meta.title, updatedAt: meta.updatedAt, running: meta.running},
        page: browserTabs[0]?.page ?? null,
      },
    ]
  })
  return {project: {name, root: deps.root, branch}, tabs}
}

async function pageBrowserTabs(deps: TabsDeps, sessionId: SessionId): Promise<BrowserTab[]> {
  const {tabs, focusedTabId} = await deps.pageTabs(sessionId)
  const focusedFirst = [
    ...tabs.filter((tab) => tab.id === focusedTabId),
    ...tabs.filter((tab) => tab.id !== focusedTabId),
  ]
  return focusedFirst.map((tab) => ({
    id: tab.id,
    page: {href: tab.url, title: tab.title, state: tab.visible ? 'visible' : 'hidden'},
  }))
}

function readText(path: string, log: Log): Promise<string | null> {
  return readFile(path, 'utf8').catch((error: unknown) => {
    if (!AbsentFileSchema.safeParse(error).success) {
      log(Effect.logWarning('[core] reading a file failed; the tab listing leaves it out', {path, error}))
    }
    return null
  })
}

async function projectName(root: string, log: Log): Promise<string | null> {
  const text = await readText(join(root, 'package.json'), log)
  if (text === null) return null
  try {
    const parsed = PackageNameSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data.name : null
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

async function gitBranch(directory: string, log: Log): Promise<string | null> {
  const head = (await readText(join(directory, '.git', 'HEAD'), log)) ?? (await worktreeHead(directory, log))
  if (head !== null) return BranchSchema.safeParse(head).data ?? null
  const parent = dirname(directory)
  return parent === directory ? null : gitBranch(parent, log)
}

async function worktreeHead(root: string, log: Log): Promise<string | null> {
  const gitdir = GitdirSchema.safeParse(await readText(join(root, '.git'), log))
  if (!gitdir.success) return null
  return readText(join(resolve(root, gitdir.data), 'HEAD'), log)
}
