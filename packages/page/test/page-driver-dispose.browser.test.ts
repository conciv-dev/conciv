import {afterEach, describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import type {ClientEffect} from '@conciv/extension'
import {makeDomPageDriver, type PageDriver} from '../src/page-driver.js'

function installBanner(): ClientEffect {
  let banner: HTMLElement | null = null
  return {
    name: 'banner',
    description: 'shows a fixture banner while enabled',
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

let driver: PageDriver | undefined

afterEach(() => {
  driver?.dispose()
  driver = undefined
})

describe('driver disposal', () => {
  it('turns off every enabled effect so host-DOM mutations do not leak past dispose', async () => {
    const banner = installBanner()
    driver = makeDomPageDriver({effects: [banner]})
    banner.set(true)
    await expect.element(page.getByText('fixture banner shown')).toBeVisible()

    driver.dispose()

    await expect.element(page.getByText('fixture banner shown')).not.toBeInTheDocument()
  })
})
