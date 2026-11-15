import {readFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {z} from 'zod'
import type {SessionMeta} from '@conciv/contract'
import type {SessionId, TabOpen, Tabs} from '@conciv/protocol/chat-types'
import type {State} from '@conciv/plugin-page/rpc'

type TabsDeps = {
  attachedSessions: () => Promise<SessionId[]>
  pageTabs: (sessionId: SessionId) => Promise<State>
  session: (sessionId: SessionId) => Promise<SessionMeta | null>
  root: string
  instructions: string
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
    projectName(deps.root),
    gitBranch(deps.root),
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

function readText(path: string): Promise<string | null> {
  return readFile(path, 'utf8').catch((error: unknown) => {
    if (!AbsentFileSchema.safeParse(error).success) {
      console.warn(`conciv: reading ${path} failed; the tab listing leaves it out`, error)
    }
    return null
  })
}

async function projectName(root: string): Promise<string | null> {
  const text = await readText(join(root, 'package.json'))
  if (text === null) return null
  try {
    const parsed = PackageNameSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data.name : null
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

async function gitBranch(directory: string): Promise<string | null> {
  const head = (await readText(join(directory, '.git', 'HEAD'))) ?? (await worktreeHead(directory))
  if (head !== null) return BranchSchema.safeParse(head).data ?? null
  const parent = dirname(directory)
  return parent === directory ? null : gitBranch(parent)
}

async function worktreeHead(root: string): Promise<string | null> {
  const gitdir = GitdirSchema.safeParse(await readText(join(root, '.git')))
  if (!gitdir.success) return null
  return readText(join(resolve(root, gitdir.data), 'HEAD'))
}
