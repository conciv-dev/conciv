import {afterEach, expect, test, vi} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal, Show, type JSX} from 'solid-js'
import {NoticeProvider, NoticeStrip, useNotify} from '../src/shell/notices.js'
import type {Notify} from '../src/chat/notify.js'

const disposers: (() => void)[] = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  vi.useRealTimers()
})

type Announcement = {message: string; assertive: boolean}

type Mounted = {notify: Notify; announced: Announcement[]; showStrip: (visible: boolean) => void}

function mountNotices(): Mounted {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [onFirstPage, setOnFirstPage] = createSignal(true)
  const announced: Announcement[] = []
  const mounted: Mounted = {
    notify: () => {},
    announced,
    showStrip: (visible) => setOnFirstPage(visible),
  }
  const Page = (): JSX.Element => {
    mounted.notify = useNotify()
    return <NoticeStrip />
  }
  const dispose = render(
    () => (
      <NoticeProvider announce={(message, assertive) => announced.push({message, assertive: assertive === true})}>
        <Show when={onFirstPage()} fallback={<p>another session</p>}>
          <Page />
        </Show>
      </NoticeProvider>
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return mounted
}

test('a notice that offers an action is still standing long after a plain one has expired', () => {
  vi.useFakeTimers()
  const mounted = mountNotices()

  mounted.notify('Now following fix the flaky test.', {action: {label: 'Undo', run: () => {}}})
  mounted.notify('Command copied. Paste it in your terminal.')

  vi.advanceTimersByTime(20_000)

  expect(page.getByText('Command copied. Paste it in your terminal.').elements()).toHaveLength(0)
  expect(page.getByText('Now following fix the flaky test.').elements()).toHaveLength(1)
})

test('a standing notice survives leaving the session it was raised in', async () => {
  const mounted = mountNotices()
  mounted.notify('Now following fix the flaky test.', {action: {label: 'Undo', run: () => {}}})
  await expect.element(page.getByText('Now following fix the flaky test.')).toBeVisible()

  mounted.showStrip(false)
  await expect.element(page.getByText('another session')).toBeVisible()
  mounted.showStrip(true)

  await expect.element(page.getByText('Now following fix the flaky test.')).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Undo'})).toBeVisible()
})

test('running the offered action takes the notice away and cannot be run twice', async () => {
  const mounted = mountNotices()
  let handedBack = 0
  mounted.notify('Now following fix the flaky test.', {
    action: {
      label: 'Undo',
      run: () => {
        handedBack += 1
      },
    },
  })

  await page.getByRole('button', {name: 'Undo'}).click()

  await expect.element(page.getByText('Now following fix the flaky test.')).not.toBeInTheDocument()
  expect(handedBack).toBe(1)
})

test('every notice can be dismissed by hand', async () => {
  const mounted = mountNotices()
  mounted.notify('Still connected to your terminal.', {tone: 'danger', action: {label: 'Hand it back', run: () => {}}})

  await page.getByRole('button', {name: 'Dismiss'}).click()

  await expect.element(page.getByText('Still connected to your terminal.')).not.toBeInTheDocument()
})

test('every notice is announced, and an alarming one interrupts', () => {
  const mounted = mountNotices()
  mounted.notify('Command copied. Paste it in your terminal.')
  mounted.notify('Still connected to your terminal.', {tone: 'danger'})

  expect(mounted.announced).toEqual([
    {message: 'Command copied. Paste it in your terminal.', assertive: false},
    {message: 'Still connected to your terminal.', assertive: true},
  ])
})

test('the way out of a notice is announced with it, not left for the eye alone', () => {
  const mounted = mountNotices()

  mounted.notify('Now following fix the flaky test.', {action: {label: 'Undo', run: () => {}}})

  expect(mounted.announced).toEqual([{message: 'Now following fix the flaky test. Undo.', assertive: false}])
})
