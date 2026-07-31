import {chromium, type Browser} from 'playwright'
import {expect as expectLocator} from 'playwright/test'
import {afterAll, beforeAll, it} from 'vitest'
import {createGenerator} from 'unocss'
import {presetConciv} from '@conciv/uno-preset'

const MARKUP =
  '<button type="button" class="anim-pulse">Working</button><button type="button" class="anim-skel">Loading</button>'

const uno = await createGenerator({presets: [presetConciv()]})
const {css} = await uno.generate(MARKUP)
const PAGE = `<!doctype html><meta charset="utf-8"><style>${css}</style>${MARKUP}`

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser.close()
})

it('keeps the pulse and the skeleton shimmering when motion is welcome', async () => {
  const page = await browser.newPage({reducedMotion: 'no-preference'})
  await page.setContent(PAGE)

  await expectLocator(page.getByRole('button', {name: 'Working'})).toHaveCSS('animation-name', 'pulse')
  await expectLocator(page.getByRole('button', {name: 'Loading'})).toHaveCSS('animation-name', 'pulse')
  await page.close()
})

it('stops the pulse and the skeleton when the reader asks for reduced motion', async () => {
  const page = await browser.newPage({reducedMotion: 'reduce'})
  await page.setContent(PAGE)

  await expectLocator(page.getByRole('button', {name: 'Working'})).toHaveCSS('animation-name', 'none')
  await expectLocator(page.getByRole('button', {name: 'Loading'})).toHaveCSS('animation-name', 'none')
  await page.close()
})
