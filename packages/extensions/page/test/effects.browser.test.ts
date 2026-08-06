import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {collectClientEffects, collectClientTools, type ClientEffect} from '@conciv/extension'
import {makeDomPageDriver, type PageDriver} from '@conciv/page'
import type {PageError} from '@conciv/protocol/page-types'
import pageExtension from '../src/client.js'
import {PAGE_TOOL_PREFIX} from '../src/shared/defs.js'

function installBanner(): ClientEffect {
  let banner: HTMLElement | null = null
  return {
    name: 'banner',
    description: 'shows the fixture banner',
    enabled: () => banner !== null,
    set: (enabled) => {
      if (enabled === (banner !== null)) return
      if (!enabled) {
        banner?.remove()
        banner = null
        return
      }
      banner = document.createElement('div')
      banner.setAttribute('role', 'note')
      banner.textContent = 'fixture banner shown'
      document.body.appendChild(banner)
    },
  }
}

let driver: PageDriver

const banner = () => page.getByText('fixture banner shown')

const effectResult = async (input: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const outcome = await driver.execute({name: `${PAGE_TOOL_PREFIX}effect`, input})
  if (!outcome.ok) throw new Error(`expected a result, got ${outcome.error.code}: ${outcome.error.message}`)
  return outcome.result
}

const effectFailure = async (input: Record<string, unknown>): Promise<PageError> => {
  const outcome = await driver.execute({name: `${PAGE_TOOL_PREFIX}effect`, input})
  if (outcome.ok) throw new Error('expected a failure, got a result')
  return outcome.error
}

beforeAll(() => {
  driver = makeDomPageDriver({
    tools: collectClientTools([pageExtension]),
    effects: collectClientEffects([
      {name: 'fixture-a', effects: [installBanner()]},
      {name: 'fixture-b', effects: [installBanner()]},
    ]),
  })
})

afterAll(() => {
  driver.dispose()
})

describe('the page.effect verb drives registered host effects', () => {
  it('lists what exists exactly once per name, with its current state', async () => {
    expect(await effectResult({action: 'list'})).toEqual({
      effects: [{name: 'banner', description: 'shows the fixture banner', enabled: false}],
    })
  })

  it('enabling visibly changes the page and disabling reverts it', async () => {
    expect(await effectResult({action: 'enable', effect: 'banner'})).toEqual({effect: 'banner', enabled: true})
    await expect.element(banner()).toBeVisible()
    expect(await effectResult({action: 'report', effect: 'banner'})).toEqual({effect: 'banner', enabled: true})
    expect(await effectResult({action: 'disable', effect: 'banner'})).toEqual({effect: 'banner', enabled: false})
    await expect.element(banner()).not.toBeInTheDocument()
  })

  it('toggle flips the effect each call', async () => {
    expect(await effectResult({action: 'toggle', effect: 'banner'})).toEqual({effect: 'banner', enabled: true})
    await expect.element(banner()).toBeVisible()
    expect(await effectResult({action: 'toggle', effect: 'banner'})).toEqual({effect: 'banner', enabled: false})
    await expect.element(banner()).not.toBeInTheDocument()
  })

  it('start and stop drive the effect like enable and disable', async () => {
    expect(await effectResult({action: 'start', effect: 'banner'})).toEqual({effect: 'banner', enabled: true})
    await expect.element(banner()).toBeVisible()
    expect(await effectResult({action: 'stop', effect: 'banner'})).toEqual({effect: 'banner', enabled: false})
    await expect.element(banner()).not.toBeInTheDocument()
  })

  it('an unknown effect name fails with the declared error naming what exists', async () => {
    const failure = await effectFailure({action: 'enable', effect: 'confetti'})
    expect(failure.raised?.code).toBe('UNKNOWN_EFFECT')
    expect(failure.message).toContain('confetti')
    expect(failure.message).toContain('banner')
  })

  it('a driving action without an effect name fails as invalid args', async () => {
    const failure = await effectFailure({action: 'enable'})
    expect(failure.code).toBe('invalid-args')
    expect(failure.message).toContain('list')
  })

  it('list rejects a passed effect name as invalid args instead of ignoring it', async () => {
    const failure = await effectFailure({action: 'list', effect: 'banner'})
    expect(failure.code).toBe('invalid-args')
    expect(failure.message).toContain('list')
  })

  it('report on a disabled effect truthfully returns enabled: false', async () => {
    expect(await effectResult({action: 'report', effect: 'banner'})).toEqual({effect: 'banner', enabled: false})
    await expect.element(banner()).not.toBeInTheDocument()
  })
})
