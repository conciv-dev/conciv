import {expect, test} from 'vitest'
import {checkSend, MAX_CONTENT_PARTS} from '../src/chat/send-checks.js'

const ready = {busy: false, connected: true}

function parts(count: number): {content: {type: 'text'; content: string}[]} {
  return {content: Array.from({length: count}, () => ({type: 'text', content: 'x'}))}
}

test('lets a message with something in it through', () => {
  expect(checkSend('rename the widget package', ready)).toEqual({ok: true})
  expect(checkSend(parts(2), ready)).toEqual({ok: true})
})

test('turns an empty message down without saying anything', () => {
  expect(checkSend('   ', ready)).toEqual({ok: false, message: null, tone: 'info'})
  expect(checkSend({content: []}, ready)).toEqual({ok: false, message: null, tone: 'info'})
})

test('turns a send down while the conversation is being compressed', () => {
  expect(checkSend('rename the widget package', {busy: true, connected: true}).ok).toBe(false)
})

test('says why it turned down too many attachments instead of dropping them', () => {
  const verdict = checkSend(parts(MAX_CONTENT_PARTS + 1), ready)
  expect(verdict).toEqual({
    ok: false,
    message: 'Too many attachments. Remove some and send again.',
    tone: 'warn',
  })
})

test('says the connection is down instead of swallowing the message', () => {
  const verdict = checkSend('rename the widget package', {busy: false, connected: false})
  expect(verdict).toEqual({
    ok: false,
    message: 'Not connected yet. Your message is still in the composer.',
    tone: 'warn',
  })
})
