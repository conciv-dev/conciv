import {describe, expect, test as baseTest} from 'vitest'
import {page} from 'vitest/browser'
import {createConciv, mountConciv, type ConcivHandle} from '../../src/mount.js'

describe('the host page drives the widget through its handle', () => {
  const test = baseTest.extend<{element: HTMLElement; handles: ConcivHandle[]}>({
    element: async ({task: _task}, use) => {
      const element = document.createElement('div')
      document.body.append(element)
      await use(element)
      element.remove()
    },
    handles: async ({task: _task}, use) => {
      const handles: ConcivHandle[] = []
      await use(handles)
      for (const handle of handles) handle.unmount()
    },
  })

  test('the handle mounts the widget, opens, closes and toggles the panel, rebinds it to another engine once it has that engine token, unmounts it, and a remount in the same tab reopens its last screen', async ({
    element,
    handles,
  }) => {
    const bound: {token: () => Promise<string>} = {token: () => Promise.resolve(crypto.randomUUID())}
    const handle = createConciv({apiBase: 'http://127.0.0.1:9', engineToken: () => bound.token()})
    handles.push(handle)

    await handle.mount(element)
    const launcher = page.getByRole('button', {name: 'Open conciv chat'})
    await expect.element(launcher).toBeVisible()

    handle.open()
    const openPanel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await expect.element(openPanel).toBeVisible()
    const panel = openPanel.element()
    handle.close()
    await expect.element(panel).not.toBeVisible()
    await expect.element(launcher).toBeVisible()
    handle.toggle()
    await expect.element(panel).toBeVisible()
    handle.toggle()
    await expect.element(panel).not.toBeVisible()

    const asked = Promise.withResolvers<void>()
    const nextToken = Promise.withResolvers<string>()
    bound.token = () => {
      asked.resolve()
      return nextToken.promise
    }
    const rebinding = handle.rebind('http://127.0.0.1:10')
    expect(await Promise.race([rebinding.then(() => 'rebound'), asked.promise.then(() => 'asked for a token')])).toBe(
      'asked for a token',
    )
    nextToken.resolve(crypto.randomUUID())
    await rebinding
    handle.open()
    await expect.element(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()

    handle.unmount()
    await expect.element(launcher).not.toBeInTheDocument()
    await handle.mount(element)
    await expect.element(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
  })
})

describe('the script tag mounts one widget', () => {
  const test = baseTest.extend<{apiBaseTag: HTMLMetaElement}>({
    apiBaseTag: async ({task: _task}, use) => {
      const tag = Object.assign(document.createElement('meta'), {name: 'conciv-api-base'})
      document.head.append(tag)
      await use(tag)
      tag.remove()
      for (const root of document.querySelectorAll('[data-conciv-script-root]')) root.remove()
    },
  })

  test('a second mountConciv call keeps the one widget the first call mounted', async ({apiBaseTag}) => {
    apiBaseTag.content = 'http://127.0.0.1:9'

    await mountConciv()
    await mountConciv()

    await expect.element(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
  })
})
