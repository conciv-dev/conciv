import {readFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {Hono} from 'hono'
import {z} from 'zod'
import type {SessionMeta} from '@conciv/contract'
import {SessionId, TabsSchema, type TabOpen, type Tabs} from '@conciv/protocol/chat-types'
import type {PageBus} from '../page-bus.js'

const PAGE_PROBE_MS = 200

type TabsDeps = {
  bus: PageBus
  session: (sessionId: SessionId) => Promise<SessionMeta | null>
  root: string
  instructions: string
  tools: (sessionId: SessionId) => Promise<TabOpen['tools']>
}

export type TabsVars = {tabs: TabsDeps}

const SessionQuerySchema = SessionId.optional().catch(undefined)

const PageSchema = TabsSchema.shape.tabs.element.shape.page

const PackageNameSchema = z.object({name: z.string()})

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

const app = new Hono<{Variables: TabsVars}>().get('/', async (c) => {
  const deps = c.var.tabs
  const sessionId = SessionQuerySchema.parse(c.req.query('session'))
  if (sessionId !== undefined) {
    const open = deps.bus.openSessions().some((entry) => entry.sessionId === sessionId)
    const instructions = deps.instructions === '' ? null : deps.instructions
    return c.json({open, instructions, tools: open ? await deps.tools(sessionId) : []} satisfies TabOpen)
  }
  return c.json(await listTabs(deps))
})

async function listTabs(deps: TabsDeps): Promise<Tabs> {
  const open = deps.bus.openSessions()
  const [metas, pages, name, branch] = await Promise.all([
    Promise.all(open.map((entry) => deps.session(entry.sessionId))),
    Promise.all(open.map((entry) => probePage(deps.bus, entry.sessionId))),
    projectName(deps.root),
    gitBranch(deps.root),
  ])
  const tabs = open.flatMap((entry, index) => {
    const meta = metas[index]
    if (meta === undefined || meta === null || meta.hidden) return []
    return [
      {
        sessionId: entry.sessionId,
        harness: meta.harnessKind,
        browserTabs: entry.subscribers,
        session: {title: meta.title, updatedAt: meta.updatedAt, running: meta.running},
        page: pages[index] ?? null,
      },
    ]
  })
  return {project: {name, root: deps.root, branch}, tabs}
}

function probePage(bus: PageBus, sessionId: SessionId): Promise<Tabs['tabs'][number]['page']> {
  const answered = bus.ask(sessionId, {name: 'page_route', input: {}, agentId: sessionId}).then(
    (answer) => PageSchema.catch(null).parse(answer.result),
    () => null,
  )
  return Promise.race([answered, delay(PAGE_PROBE_MS, null)])
}

function readText(path: string): Promise<string | null> {
  return readFile(path, 'utf8').catch(() => null)
}

async function projectName(root: string): Promise<string | null> {
  const text = await readText(join(root, 'package.json'))
  if (text === null) return null
  try {
    const parsed = PackageNameSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data.name : null
  } catch {
    return null
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

export default app
