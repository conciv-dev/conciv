import {expect} from 'vitest'
import {page} from 'vitest/browser'

type Locator = ReturnType<typeof page.getByText>

export async function expectRetryRecovers(
  clearFailure: () => void,
  editor: () => Locator,
  failureLocator: () => Locator,
): Promise<void> {
  clearFailure()
  await page.getByRole('button', {name: 'Retry'}).click()
  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await expect.element(failureLocator()).not.toBeInTheDocument()
}
