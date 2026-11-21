import {describe, expect, it} from 'vitest'
import {cli, createEngine} from '@conciv/plugin-testkit'

describe('auth', () => {
  it('link prints a one-time login link, revoke lists and revokes, and an unknown id is a user error', async () => {
    const engine = await createEngine()

    const linked = await cli(['auth', 'link', 'http://localhost:3001/shop#tab=cart'], {cwd: engine.root})
    expect(linked.exitCode).toBe(0)
    expect(JSON.parse(linked.stdout)).toEqual({
      ok: true,
      data: {
        link: expect.stringMatching(/^http:\/\/localhost:3001\/shop#tab=cart&conciv_otp=[^&]+$/),
        expiresAt: expect.any(Number),
      },
    })

    const listed = await cli(['auth', 'revoke'], {cwd: engine.root})
    expect(JSON.parse(listed.stdout)).toEqual({ok: true, data: {revoked: [], trusted: []}})

    const unknown = await cli(['auth', 'revoke', 'browser-404'], {cwd: engine.root})
    expect(unknown.exitCode).toBe(1)
    expect(JSON.parse(unknown.stdout)).toEqual({
      ok: false,
      error: {
        kind: 'user',
        message: 'no trusted browser has the id "browser-404"',
        hint: 'run `conciv auth revoke` without an id to list the trusted browsers',
      },
    })

    const all = await cli(['auth', 'revoke', '--all'], {cwd: engine.root})
    expect(JSON.parse(all.stdout)).toEqual({ok: true, data: {revoked: [], trusted: []}})
  })

  it('outside a project that ran the engine, link says no engine state was found', async () => {
    const linked = await cli(['auth', 'link', 'http://localhost:3001/'])

    expect(linked.exitCode).toBe(1)
    expect(JSON.parse(linked.stdout)).toEqual({
      ok: false,
      error: {
        kind: 'user',
        message: 'no conciv engine state found here or in any parent directory',
        hint: 'run this inside a project that has run the conciv dev server (it writes .conciv/server.json)',
      },
    })
  })
})
