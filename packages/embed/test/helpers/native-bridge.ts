import type {Page} from 'playwright'
import {PageToNativeSchema, type PageToNativeMessage} from '@conciv/extension-ios/bridge'

export type NativeBridge = {
  posted: PageToNativeMessage[]
  notify: (message: PageToNativeMessage) => void
}

export async function captureNativePosts(page: Page): Promise<NativeBridge> {
  const bridge: NativeBridge = {posted: [], notify: () => {}}
  await page.exposeFunction('concivNativePost', (message: unknown) => {
    const parsed = PageToNativeSchema.safeParse(message)
    if (!parsed.success) return
    bridge.posted.push(parsed.data)
    bridge.notify(parsed.data)
  })
  return bridge
}

export async function installNativeStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__p2n = []
    window.webkit = {
      messageHandlers: {
        concivBridge: {
          postMessage: (message) => {
            window.__p2n.push(message)
            void window.concivNativePost(message)
          },
        },
      },
    }
  })
}
