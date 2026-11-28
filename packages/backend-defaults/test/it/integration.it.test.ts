import {createHash} from 'node:crypto'
import {mkdirSync, symlinkSync} from 'node:fs'
import {join} from 'node:path'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {makeRpcClient} from '@conciv/client'
import {describe, expect} from 'vitest'
import {test} from '../utils/engine-test.js'

describe('a user connects a plugin integration', () => {
  const plugins = ['./test/fixtures/plugins/figma-account']

  const fingerprint = (secret: string) => createHash('sha256').update(secret).digest('hex')

  const ENV_KEY = 'figma-env-key-7c41'
  const TYPED_KEY = 'figma-typed-key-93be'
  const OAUTH_ACCESS = 'figma-oauth-access-1d02'
  const OAUTH_REFRESH = 'figma-oauth-refresh-5a77'
  const REFRESHED_ACCESS = 'figma-refreshed-access'
  const SPARE_KEY = 'figma-spare-key-40d8'

  test('the engine env answers first, a typed key then wins, an expiring sign-in refreshes, and removing them falls back to the env', async ({
    createEngine,
    connect,
  }) => {
    const home = tempDir('conciv-shared-home-')
    const engine = await createEngine({plugins, logLevel: 'debug'}, {home, env: {FIGMA_API_KEY: ENV_KEY}})
    const rpc = connect(engine)
    const secretTool = engine.session.tool('figma_secret')
    const seen: unknown[] = []
    const reading = new AbortController()
    const events = await rpc.event.subscribe(undefined, {signal: reading.signal})
    async function collect() {
      for await (const event of events) seen.push(event)
    }
    const collecting = collect().catch(() => undefined)
    async function secret() {
      const output = await secretTool.call({})
      seen.push(output)
      return output
    }

    const listed = await rpc.integration.list()
    seen.push(listed)
    expect(listed.data).toContainEqual(
      expect.objectContaining({
        id: 'figma',
        name: 'Figma',
        methods: expect.arrayContaining([
          expect.objectContaining({type: 'key'}),
          expect.objectContaining({type: 'env'}),
        ]),
      }),
    )
    expect(await secret()).toMatchObject({kind: 'env', fingerprint: fingerprint(ENV_KEY)})

    seen.push(await rpc.integration.connect.key({integrationId: 'figma', key: TYPED_KEY, label: 'Work'}))
    const afterKey = await rpc.credential.list()
    seen.push(afterKey)
    expect(afterKey).toEqual([
      {
        id: expect.any(String),
        integrationId: 'figma',
        label: 'Work',
        active: true,
        value: {type: 'key', key: '<redacted>'},
      },
    ])
    const fetched = makeRpcClient(engine.address.apiBase, {token: engine.address.token})
    expect(await fetched.credential.list()).toEqual(afterKey)
    expect(await secret()).toMatchObject({
      kind: 'credential',
      fingerprint: fingerprint(TYPED_KEY),
      value: {type: 'key', key: '<redacted>'},
    })

    const otherHome = await createEngine({plugins}, {home: tempDir('conciv-other-home-'), directory: engine.root})
    expect(await connect(otherHome).credential.list()).toEqual([])
    const otherProject = await createEngine({plugins}, {home, directory: tempDir('conciv-other-project-')})
    const shared = await connect(otherProject).credential.list()
    seen.push(shared)
    expect(shared).toEqual(afterKey)

    const spare = await fetched.credential.create({
      integrationId: 'figma',
      label: 'Spare',
      value: {type: 'key', key: SPARE_KEY},
      activate: false,
    })
    seen.push(spare)
    expect(spare).toMatchObject({label: 'Spare', active: false})
    expect(await secret()).toMatchObject({fingerprint: fingerprint(TYPED_KEY)})

    const signedIn = await rpc.credential.create({
      integrationId: 'figma',
      label: 'Sign-in',
      value: {type: 'oauth', methodId: 'oauth', access: OAUTH_ACCESS, refresh: OAUTH_REFRESH, expires: 1},
    })
    seen.push(signedIn)
    expect(signedIn).toMatchObject({label: 'Sign-in', active: true})
    expect(await Promise.all([secret(), secret()])).toEqual([
      expect.objectContaining({fingerprint: fingerprint(REFRESHED_ACCESS), refreshes: 1}),
      expect.objectContaining({fingerprint: fingerprint(REFRESHED_ACCESS), refreshes: 1}),
    ])

    seen.push(await rpc.credential.remove({credentialId: signedIn.id}))
    const afterRemove = await rpc.credential.list()
    seen.push(afterRemove)
    expect(afterRemove.map(({label, active}) => ({label, active}))).toEqual([
      {label: 'Work', active: false},
      {label: 'Spare', active: true},
    ])
    expect(await secret()).toMatchObject({fingerprint: fingerprint(SPARE_KEY)})

    const missing = await rpc.integration.connect
      .key({integrationId: 'missing', key: TYPED_KEY})
      .catch((error) => error)
    seen.push(missing, String(missing), missing?.cause)
    expect(missing).toMatchObject({code: 'INTEGRATION_NOT_FOUND'})
    const refused = await rpc.integration.oauth
      .connect({integrationId: 'figma', methodId: 'oauth'})
      .catch((error) => error)
    seen.push(refused, String(refused))
    expect(refused).toMatchObject({
      code: 'INTEGRATION_AUTHORIZATION',
      message: 'figma sign-in is not part of this fixture',
    })

    for (const credential of await rpc.credential.list())
      seen.push(await rpc.credential.remove({credentialId: credential.id}))
    seen.push(await rpc.credential.list())
    expect(await rpc.credential.list()).toEqual([])
    expect(await secret()).toMatchObject({kind: 'env', fingerprint: fingerprint(ENV_KEY)})

    const logs = await rpc.logs.query({limit: 2000})
    reading.abort()
    await collecting
    expect(JSON.stringify(logs.events)).toContain('credential')
    expect(seen.some((event) => JSON.stringify(event).includes('credential.switched'))).toBe(true)
    const everything = JSON.stringify([seen, logs.events])
    for (const plain of [ENV_KEY, TYPED_KEY, SPARE_KEY, OAUTH_ACCESS, OAUTH_REFRESH, REFRESHED_ACCESS])
      expect(everything).not.toContain(plain)

    const realHome = tempDir('conciv-real-home-')
    const linkedHome = join(tempDir('conciv-linked-home-'), 'home')
    mkdirSync(realHome, {recursive: true})
    symlinkSync(realHome, linkedHome)
    const homeless = await createEngine({plugins}, {home: linkedHome})
    const homelessRpc = connect(homeless)
    expect(await homelessRpc.meta.harnesses()).toMatchObject({harnesses: expect.any(Array)})
    await expect(homelessRpc.credential.list()).rejects.toMatchObject({code: 'HOME_UNREACHABLE'})
    await expect(homelessRpc.integration.connect.key({integrationId: 'figma', key: TYPED_KEY})).rejects.toMatchObject({
      code: 'HOME_UNREACHABLE',
    })
  })
})
