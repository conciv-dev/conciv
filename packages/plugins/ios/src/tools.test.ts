import {readFile, stat} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {describe, expect} from 'vitest'
import {TestLLM, test} from '@conciv/core/testing'
import {IOS_PLUGIN} from '../test/engine.js'

describe('the ios plugin with no options', () => {
  test('every ios tool answers that the plugin is not configured, without an ask, and the Swift SDK pairing file still names the engine', async ({
    createEngine,
  }) => {
    const engine = await createEngine({plugins: [IOS_PLUGIN]})
    const notConfigured = {ok: false, error: 'ios plugin not configured'}
    const pairing = join(homedir(), '.conciv', 'dev-endpoint.json')

    expect(JSON.parse(await readFile(pairing, 'utf8'))).toEqual({apiBase: engine.address.apiBase, pid: process.pid})
    expect((await stat(pairing)).mode & 0o777).toBe(0o600)

    expect(await engine.session.tool('ios_build').call({})).toEqual(notConfigured)
    expect(await engine.session.tool('ios_run').call({})).toEqual(notConfigured)
    expect(await engine.session.tool('ios_screenshot').call({})).toEqual(notConfigured)
    expect(await engine.session.tool('ios_logs').call({})).toEqual(notConfigured)
  })
})

describe('the ios rules in the system prompt', () => {
  test('a configured app adds the overlay and app rules to the model request, and no options add none', async ({
    createEngine,
  }) => {
    const configured = await createEngine({
      plugins: [[IOS_PLUGIN, {projectRoot: 'PayApp', bundleId: 'dev.conciv.pay', buildMode: 'swiftc'}]],
    })
    await configured.reply(TestLLM.text('The button is on the native screen'))
    await configured.session.send('Where is the pay button?')

    const [configuredRequest] = await configured.requests()
    const configuredSystem = configuredRequest?.system.join('\n')
    expect(configuredSystem).toContain(
      'You are running as an overlay inside a native iOS app on the simulator, not on a web page.',
    )
    expect(configuredSystem).toContain(
      'bundle id dev.conciv.pay, built in swiftc mode with the default scheme for the iPhone 17 Pro simulator.',
    )

    const unconfigured = await createEngine({plugins: [IOS_PLUGIN]})
    await unconfigured.reply(TestLLM.text('I see a web page'))
    await unconfigured.session.send('Where is the pay button?')

    const [unconfiguredRequest] = await unconfigured.requests()
    const unconfiguredSystem = unconfiguredRequest?.system.join('\n')
    expect(unconfiguredSystem).not.toContain(
      'You are running as an overlay inside a native iOS app on the simulator, not on a web page.',
    )
    expect(unconfiguredSystem).not.toContain('This session serves exactly one app')
  })
})

describe('building and running a configured app', () => {
  test('the agent asks before ios_build and before ios_run, and a stopped turn runs neither', async ({
    createEngine,
  }) => {
    const engine = await createEngine({
      plugins: [[IOS_PLUGIN, {projectRoot: 'PayApp', bundleId: 'dev.conciv.pay', buildMode: 'swiftc'}]],
    })

    await engine.reply(TestLLM.toolCall('c1', 'ios_build', {}))
    const buildAsked = await engine.event('permission.asked')
    const building = engine.session.send('Build the app')
    await expect(buildAsked.arrived).resolves.toMatchObject({data: {action: 'ios_build', resources: ['*']}})
    await engine.session.stop()
    await building
    expect(await engine.requests()).toHaveLength(1)

    await engine.reply(TestLLM.toolCall('c2', 'ios_run', {}))
    const runAsked = await engine.event('permission.asked')
    const running = engine.session.send('Run the app')
    await expect(runAsked.arrived).resolves.toMatchObject({data: {action: 'ios_run', resources: ['*']}})
    await engine.session.stop()
    await running
    expect(await engine.requests()).toHaveLength(2)
  })
})

describe('the ios plugin with bad options', () => {
  test.for<{problem: string; options: Record<string, string>; state: unknown}>([
    {
      problem: 'a missing bundle id',
      options: {projectRoot: 'PayApp'},
      state: {status: 'failed', error: expect.stringMatching(/^failed to load plugin: InvalidOptions: .*bundleId/s)},
    },
    {
      problem: 'a concivUrl with a page path',
      options: {projectRoot: 'PayApp', bundleId: 'dev.conciv.pay', concivUrl: 'http://127.0.0.1:4732/widget/panel'},
      state: {
        status: 'failed',
        error: expect.stringContaining(
          'concivUrl must be the core api base with no page path: the swift sdk appends /widget itself',
        ),
      },
    },
    {
      problem: 'a concivUrl that ends in /widget',
      options: {projectRoot: 'PayApp', bundleId: 'dev.conciv.pay', concivUrl: 'http://127.0.0.1:4732/widget'},
      state: {status: 'active'},
    },
  ])('the engine lists the ios plugin state for $problem', async ({options, state}, {createEngine}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/lister', [IOS_PLUGIN, options]]})

    expect(await engine.session.tool('list_plugins').call({})).toEqual({
      plugins: expect.arrayContaining([expect.objectContaining({id: 'ios', state})]),
    })
  })
})
