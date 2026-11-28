import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {concivStateDir} from '@conciv/types/state-types'
import {tempDir} from '@internal/vitest-config/temp-dir'
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
    expect(await secret()).toEqual({
      kind: 'env',
      fingerprint: fingerprint(ENV_KEY),
      value: {type: 'key', key: '<redacted>'},
    })

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
    expect(await secret()).toEqual({
      kind: 'credential',
      fingerprint: fingerprint(TYPED_KEY),
      value: {type: 'key', key: '<redacted>'},
    })

    const project = new DatabaseSync(join(concivStateDir(engine.root), 'conciv.db'), {readOnly: true})
    const tables = project.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    project.close()
    expect(tables).toContainEqual({name: 'kv'})
    expect(tables).not.toContainEqual({name: 'credential'})
    const neighbour = await createEngine({plugins}, {home, directory: tempDir('conciv-other-project-')})
    const neighbourCredentials = await connect(neighbour).credential.list()
    seen.push(neighbourCredentials)
    expect(neighbourCredentials).toEqual(afterKey)

    const signedIn = await rpc.credential.create({
      integrationId: 'figma',
      label: 'Sign-in',
      value: {type: 'oauth', methodId: 'oauth', access: OAUTH_ACCESS, refresh: OAUTH_REFRESH, expires: 1},
    })
    seen.push(signedIn)
    expect(signedIn).toMatchObject({label: 'Sign-in', active: true})
    expect(await secret()).toMatchObject({kind: 'credential', fingerprint: fingerprint(REFRESHED_ACCESS)})

    const failure = await rpc.integration.connect
      .key({integrationId: 'missing', key: TYPED_KEY})
      .catch((error) => error)
    seen.push(failure, String(failure), failure?.cause)
    expect(failure).toMatchObject({code: 'INTEGRATION_NOT_FOUND'})

    for (const credential of await rpc.credential.list())
      seen.push(await rpc.credential.remove({credentialId: credential.id}))
    seen.push(await rpc.credential.list())
    expect(await rpc.credential.list()).toEqual([])
    expect(await secret()).toEqual({
      kind: 'env',
      fingerprint: fingerprint(ENV_KEY),
      value: {type: 'key', key: '<redacted>'},
    })

    const logs = await rpc.logs.query({limit: 2000})
    reading.abort()
    await collecting
    expect(JSON.stringify(logs.events)).toContain('credential')
    expect(seen.some((event) => JSON.stringify(event).includes('credential.switched'))).toBe(true)
    const everything = JSON.stringify([seen, logs.events])
    for (const plain of [ENV_KEY, TYPED_KEY, OAUTH_ACCESS, OAUTH_REFRESH, REFRESHED_ACCESS])
      expect(everything).not.toContain(plain)
  })
})
