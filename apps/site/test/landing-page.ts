import type {Page} from 'playwright'
import {expect as expectLocator} from 'playwright/test'

const HYDRATION_TIMEOUT_MS = 20_000

export const heroBackdrop = (page: Page) => page.locator('.od-hero-backdrop svg')

export async function waitForLandingHydration(page: Page): Promise<void> {
  await expectLocator(heroBackdrop(page)).toBeAttached({timeout: HYDRATION_TIMEOUT_MS})
}
