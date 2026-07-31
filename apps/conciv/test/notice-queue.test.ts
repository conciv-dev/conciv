import {describe, expect, test} from 'vitest'
import {dismissNotice, makeNotice, NO_NOTICES, pushNotice, type Notice, type NoticeQueue} from '../src/chat/notify.js'

function push(queue: NoticeQueue, notice: Notice): NoticeQueue {
  return pushNotice(queue, notice)
}

function messages(queue: NoticeQueue): string[] {
  return queue.visible.map((notice) => notice.message)
}

describe('a notice that offers an action', () => {
  test('is sticky, so it waits for the reader instead of expiring', () => {
    const undo = makeNotice(1, 'Now following fix the flaky test.', {action: {label: 'Undo', run: () => {}}})
    expect(undo.sticky).toBe(true)
  })

  test('is never pushed out by louder informational ones', () => {
    const undo = makeNotice(1, 'Now following fix the flaky test.', {action: {label: 'Undo', run: () => {}}})
    const queue = [makeNotice(2, 'Command copied.'), makeNotice(3, 'Compaction failed.')].reduce(
      push,
      push(NO_NOTICES, undo),
    )

    expect(messages(queue)).toContain('Now following fix the flaky test.')
    expect(messages(queue)).toEqual(['Compaction failed.', 'Now following fix the flaky test.'])
  })
})

test('an informational notice is not sticky and fills the stack newest first', () => {
  const queue = push(push(NO_NOTICES, makeNotice(1, 'first')), makeNotice(2, 'second'))

  expect(queue.visible.every((notice) => notice.sticky)).toBe(false)
  expect(messages(queue)).toEqual(['second', 'first'])
})

test('a third informational notice evicts the oldest one that can expire', () => {
  const queue = [makeNotice(2, 'second'), makeNotice(3, 'third')].reduce(push, push(NO_NOTICES, makeNotice(1, 'first')))

  expect(messages(queue)).toEqual(['third', 'second'])
  expect(queue.waiting).toEqual([])
})

test('a notice that arrives behind two sticky ones waits, then takes the freed slot', () => {
  const sticky = (id: number, message: string) => makeNotice(id, message, {action: {label: 'Undo', run: () => {}}})
  const full = push(push(NO_NOTICES, sticky(1, 'first')), sticky(2, 'second'))

  const queued = push(full, makeNotice(3, 'third'))
  expect(messages(queued)).toEqual(['second', 'first'])
  expect(queued.waiting.map((notice) => notice.message)).toEqual(['third'])

  const freed = dismissNotice(queued, 1)
  expect(messages(freed)).toEqual(['third', 'second'])
  expect(freed.waiting).toEqual([])
})

test('a notice repeated under the same key replaces the one already showing', () => {
  const first = makeNotice(1, 'Couldn’t hand it back.', {key: 'hand-back', tone: 'danger'})
  const second = makeNotice(2, 'Handed back to your terminal.', {key: 'hand-back', tone: 'success'})

  const queue = push(push(NO_NOTICES, first), second)

  expect(messages(queue)).toEqual(['Handed back to your terminal.'])
})

test('dismissing a notice removes exactly that one', () => {
  const queue = push(push(NO_NOTICES, makeNotice(1, 'first')), makeNotice(2, 'second'))

  expect(messages(dismissNotice(queue, 2))).toEqual(['first'])
})
