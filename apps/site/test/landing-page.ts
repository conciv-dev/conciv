import type {Page} from 'playwright'
import {expect as expectLocator} from 'playwright/test'

const HYDRATION_TIMEOUT_MS = 20_000

export const heroCanvas = (page: Page) => page.locator('section:has(h1) canvas').first()

export async function waitForLandingHydration(page: Page): Promise<void> {
  await expectLocator(heroCanvas(page)).toBeAttached({timeout: HYDRATION_TIMEOUT_MS})
}
