import {expect} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {createSiteTest} from './site-fixture.js'
import {starsResponseSchema} from '../src/lib/star-count.js'

const SITE_PORT = 8796
const INSPECTOR_PORT = 9796
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
const DESKTOP = {width: 1440, height: 900}

function rightEdge(box: {x: number; width: number} | null): number {
  if (box === null) throw new Error('element has no box')
  return box.x + box.width
}

const test = createSiteTest({
  port: SITE_PORT,
  inspectorPort: INSPECTOR_PORT,
  vars: {GITHUB_TOKEN: 'not-a-github-token'},
})

test.describe('github star count when GitHub rejects the request', () => {
  test('renders the bare GitHub button, with the star flush against the padding and no count', async ({browser}) => {
    const page = await browser.newPage({viewport: DESKTOP})
    const response = await page.request.get(`${ORIGIN}/api/stars`)
    expect(starsResponseSchema.parse(await response.json())).toEqual({stars: null})

    const revalidated = page.waitForResponse((candidate) => candidate.url().endsWith('/api/stars'))
    await page.goto(`${ORIGIN}/this-page-does-not-exist`, {waitUntil: 'domcontentloaded'})
    const button = page.getByRole('link', {name: 'conciv on GitHub'}).first()
    await expectLocator(button).toBeVisible({timeout: 20_000})
    await expectLocator(button).toHaveText('GitHub')
    await revalidated
    await expectLocator(button).toHaveText('GitHub')

    const buttonEdge = rightEdge(await button.boundingBox())
    const starEdge = rightEdge(await button.locator('svg').last().boundingBox())
    const trailingInset = await button.evaluate((element) => {
      const {paddingRight, borderRightWidth} = getComputedStyle(element)
      return parseFloat(paddingRight) + parseFloat(borderRightWidth)
    })
    expect(buttonEdge - starEdge).toBeCloseTo(trailingInset, 0)

    await page.close()
  }, 60_000)
})
