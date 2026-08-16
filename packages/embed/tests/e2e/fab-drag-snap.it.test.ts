import {expect, test, type Page} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'

const suite = setupWidgetSuite()

type Frame = {x: number; y: number; width: number; height: number}

const launcher = (page: Page) => page.getByRole('button', {name: 'Open conciv chat'})

async function armFrameSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const shadowHosts = [...document.querySelectorAll('*')]
    const element =
      document.querySelector('[data-pw-fab]') ??
      shadowHosts.map((host) => host.shadowRoot?.querySelector('[data-pw-fab]')).find(Boolean)
    if (!(element instanceof HTMLElement)) throw new Error('launcher not found')
    globalThis.__fabFrames = new Promise((resolve) => {
      const frames: Array<{x: number; y: number; width: number; height: number}> = []
      const tick = () => {
        const rect = element.getBoundingClientRect()
        frames.push({x: rect.x, y: rect.y, width: rect.width, height: rect.height})
        if (frames.length < 72) {
          requestAnimationFrame(tick)
          return
        }
        resolve(frames)
      }
      window.addEventListener('pointerup', () => requestAnimationFrame(tick), {once: true, capture: true})
    })
  })
}

async function collectFrames(page: Page): Promise<Frame[]> {
  return page.evaluate(() => globalThis.__fabFrames)
}

async function settledBox(page: Page): Promise<Frame> {
  return page.evaluate(() => {
    const shadowHosts = [...document.querySelectorAll('*')]
    const element =
      document.querySelector('[data-pw-fab]') ??
      shadowHosts.map((host) => host.shadowRoot?.querySelector('[data-pw-fab]')).find(Boolean)
    if (!(element instanceof HTMLElement)) throw new Error('launcher not found')
    return new Promise((resolve) => {
      const settle = () => {
        const pending = element
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        if (pending.length > 0) {
          Promise.allSettled(pending.map((animation) => animation.finished)).then(settle)
          return
        }
        requestAnimationFrame(() => {
          const rect = element.getBoundingClientRect()
          resolve({x: rect.x, y: rect.y, width: rect.width, height: rect.height})
        })
      }
      settle()
    })
  })
}

async function dragLauncherTo(page: Page, target: {x: number; y: number}): Promise<void> {
  const box = await launcher(page).boundingBox()
  if (!box) throw new Error('launcher has no box')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, {steps: 12})
}

function outsideViewport(frames: Frame[], viewport: {width: number; height: number}): Frame[] {
  return frames.filter(
    (frame) =>
      frame.x < -0.5 ||
      frame.y < -0.5 ||
      frame.x + frame.width > viewport.width + 0.5 ||
      frame.y + frame.height > viewport.height + 0.5,
  )
}

function largestRetreat(frames: Frame[]): number {
  const last = frames[frames.length - 1]
  if (!last) return 0
  const distances = frames.map((frame) => Math.hypot(frame.x - last.x, frame.y - last.y))
  return distances.reduce((worst, distance, index) => Math.max(worst, distance - (distances[index - 1] ?? distance)), 0)
}

test('a launcher dropped past the viewport edge settles inward without ever leaving the viewport', async ({page}) => {
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('no viewport')
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await expect(launcher(page)).toBeVisible()

  await dragLauncherTo(page, {x: viewport.width - 2, y: 2})
  await armFrameSampler(page)
  await page.mouse.up()

  await expect(launcher(page)).not.toHaveClass(/cursor-grabbing/)
  const frames = await collectFrames(page)

  expect(outsideViewport(frames, viewport)).toEqual([])
  expect(largestRetreat(frames)).toBeLessThanOrEqual(1)
})

test('a launcher dropped on its resting spot does not move after release', async ({page}) => {
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await expect(launcher(page)).toBeVisible()

  const initial = await launcher(page).boundingBox()
  if (!initial) throw new Error('launcher has no box')
  const restX = initial.x + initial.width / 2
  const restY = initial.y + initial.height / 2

  await page.mouse.move(restX, restY)
  const beforePress = await settledBox(page)

  await page.mouse.down()
  await page.mouse.move(restX - 40, restY - 40, {steps: 8})
  await page.mouse.move(restX, restY, {steps: 8})
  await armFrameSampler(page)
  await page.mouse.up()

  await expect(launcher(page)).not.toHaveClass(/cursor-grabbing/)
  const frames = await collectFrames(page)

  const drift = frames.map((frame) => Math.hypot(frame.x - beforePress.x, frame.y - beforePress.y))
  expect(Math.max(...drift)).toBeLessThanOrEqual(1)
})
