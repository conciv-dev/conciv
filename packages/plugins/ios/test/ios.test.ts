import {fileURLToPath} from 'node:url'
import {describe, expect, it, onTestFinished} from 'vitest'
import {z} from 'zod'
import {connectMcpClient, makeDiscoverTools, makeRpcClient} from '@conciv/harness-testkit'
import {readApprovalAsk} from '@conciv/protocol/chat-event-types'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

const NotConfiguredSchema = z.strictObject({ok: z.literal(false), error: z.string()})

const NOT_CONFIGURED = {ok: false, error: 'ios plugin not configured'}

async function boot(options?: Record<string, string>): Promise<CoreKit> {
  const kit = await bootCoreKit({
    id: 'fake',
    plugins: [options === undefined ? PACKAGE_DIR : [PACKAGE_DIR, options]],
  })
  onTestFinished(() => kit.cleanup())
  return kit
}

async function directTool(kit: CoreKit, name: string, input: Record<string, unknown> = {}): Promise<unknown> {
  const mcp = await connectMcpClient(`${kit.base}/api/mcp`, {[CONCIV_SESSION_HEADER]: await kit.session()})
  try {
    const tool = (await mcp.tools()).find((entry) => entry.name === name)
    if (!tool) throw new Error(`${name} is not a direct tool on /api/mcp`)
    return JSON.parse(z.string().parse(await tool.execute(input)))
  } finally {
    await mcp.close()
  }
}

async function directToolNames(kit: CoreKit): Promise<string[]> {
  const mcp = await connectMcpClient(`${kit.base}/api/mcp`)
  try {
    return (await mcp.tools()).map((tool) => tool.name)
  } finally {
    await mcp.close()
  }
}

async function deniedAsk(kit: CoreKit, name: string): Promise<{toolName: string; failure: unknown}> {
  const session = await kit.session()
  const events = await kit.events(session)
  const settled = directTool(kit, name).then(
    () => new Error(`${name} answered instead of being denied`),
    (error: unknown) => error,
  )
  const asked = readApprovalAsk(await events.waitFor((event) => readApprovalAsk(event) !== null))
  if (asked === null) throw new Error(`${name} raised no permission ask`)
  const client = makeRpcClient(kit.base, {headers: {[CONCIV_SESSION_HEADER]: session}})
  await client.chat.permissionDecision({approvalId: asked.approvalId, approved: false, scope: 'once'})
  return {toolName: asked.toolName, failure: await settled}
}

describe('the ios plugin in an engine', () => {
  it('offers screenshot and logs in code mode, keeps build and run direct, and answers not configured from every tool', async () => {
    const kit = await boot()

    const plugin = (await kit.rpc.plugin.list()).data.find((entry) => entry.id === 'ios')
    expect(plugin?.state).toEqual({status: 'active'})

    const discover = makeDiscoverTools(kit.base, await kit.session())
    const read = await discover(['ios_screenshot', 'ios_logs'])
    expect(read.tools.map((tool) => tool.name)).toEqual(['external_ios_screenshot', 'external_ios_logs'])
    for (const tool of read.tools) expect(tool.description, tool.name).not.toBe('')
    const asking = await discover(['ios_build', 'ios_run'])
    expect(asking.tools).toEqual([])
    expect(asking.errors).toHaveLength(2)

    const direct = await directToolNames(kit)
    expect(direct).toEqual(expect.arrayContaining(['ios_build', 'ios_run']))
    expect(direct).not.toContain('ios_screenshot')
    expect(direct).not.toContain('ios_logs')

    expect(NotConfiguredSchema.parse(await kit.callTool('ios_logs', {}))).toEqual(NOT_CONFIGURED)
    expect(NotConfiguredSchema.parse(await kit.callTool('ios_screenshot', {}))).toEqual(NOT_CONFIGURED)
    expect(await directTool(kit, 'ios_build')).toEqual(NOT_CONFIGURED)
    expect(await directTool(kit, 'ios_run')).toEqual(NOT_CONFIGURED)
  })

  it('asks before building or running a configured app, and a denial runs nothing', async () => {
    const kit = await boot({projectRoot: 'PayApp', bundleId: 'dev.conciv.pay', buildMode: 'swiftc'})

    const build = await deniedAsk(kit, 'ios_build')
    expect(build.toolName).toContain('ios_build')
    expect(String(build.failure)).toContain('denied')

    const run = await deniedAsk(kit, 'ios_run')
    expect(run.toolName).toContain('ios_run')
    expect(String(run.failure)).toContain('denied')
  })
})
