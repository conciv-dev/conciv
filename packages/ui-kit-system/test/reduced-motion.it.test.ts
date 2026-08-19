import {expect as expectLocator} from 'playwright/test'
import {createGenerator} from 'unocss'
import {presetConciv} from '@conciv/uno-preset'
import {test} from '@conciv/browser-fixture'

const LOOPING: [string, string][] = [
  ['Waiting', 'anim-dot1'],
  ['Switching model', 'anim-switching'],
  ['Compacting', 'anim-compact'],
  ['Recording', 'anim-fab-ring'],
  ['Working', 'anim-pulse'],
  ['Loading', 'anim-skel'],
  ['Running a tool', 'anim-tool-spin'],
  ['Thinking', 'anim-think-shimmer'],
]

const MARKUP = LOOPING.map(([name, token]) => `<button type="button" class="${token}">${name}</button>`).join('')

const uno = await createGenerator({presets: [presetConciv()]})
const {css} = await uno.generate(MARKUP)
const PAGE = `<!doctype html><meta charset="utf-8"><style>${css}</style>${MARKUP}`

const COLLAPSE = ['anim-collapse-open', 'anim-collapse-closed']
const COLLAPSE_MARKUP = COLLAPSE.map((token) => `<div class="${token}">${token}</div>`).join('')
const {css: collapseCss} = await uno.generate(COLLAPSE_MARKUP)
const COLLAPSE_PAGE = `<!doctype html><meta charset="utf-8"><style>${collapseCss}</style>${COLLAPSE_MARKUP}`

test('keeps every looping shortcut animating when motion is welcome', async ({browser}) => {
  const page = await browser.newPage({reducedMotion: 'no-preference'})
  await page.setContent(PAGE)

  for (const [name] of LOOPING)
    await expectLocator(page.getByRole('button', {name})).not.toHaveCSS('animation-name', 'none')
  await page.close()
})

test('stops every looping shortcut when the reader asks for reduced motion', async ({browser}) => {
  const page = await browser.newPage({reducedMotion: 'reduce'})
  await page.setContent(PAGE)

  for (const [name] of LOOPING)
    await expectLocator(page.getByRole('button', {name})).toHaveCSS('animation-name', 'none')
  await page.close()
})

test('still reaches the collapsed grid-template-rows state when the reader asks for reduced motion', async ({
  browser,
}) => {
  const page = await browser.newPage({reducedMotion: 'reduce'})
  await page.setContent(COLLAPSE_PAGE)

  for (const token of COLLAPSE) {
    await expectLocator(page.getByText(token)).not.toHaveCSS('animation-name', 'none')
    await expectLocator(page.getByText(token)).toHaveCSS('animation-duration', '1e-05s')
  }
  await page.close()
})
