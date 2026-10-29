import {expect, test} from 'vitest'
import {MAX_ATTACHMENT_RAW_BYTES} from '@conciv/protocol/chat-types'
import {WS_RPC_PAYLOAD_BUDGET_BYTES} from '@conciv/protocol/rpc-types'
import {checkSend, MAX_CONTENT_PARTS} from '../src/pane/send-checks.js'

const ready = {busy: false, reachable: true}

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
  expect(checkSend('rename the widget package', {busy: true, reachable: true}).ok).toBe(false)
})

test('says why it turned down too many attachments instead of dropping them', () => {
  const verdict = checkSend(parts(MAX_CONTENT_PARTS + 1), ready)
  expect(verdict).toEqual({
    ok: false,
    message: 'Too many attachments. Remove some and send again.',
    tone: 'warn',
  })
})

test('turns down a message whose payload would blow the ws frame limit', () => {
  const oversized = {
    content: [
      {type: 'text', content: 'look at this'},
      {type: 'image', source: {type: 'data', mimeType: 'image/png', value: 'A'.repeat(WS_RPC_PAYLOAD_BUDGET_BYTES)}},
    ],
  }
  const verdict = checkSend(oversized, ready)
  expect(verdict).toEqual({
    ok: false,
    message: 'Message too large to send. Remove an attachment or shorten it.',
    tone: 'warn',
  })
})

test('lets a message with a budget-sized attachment through', () => {
  const largestBase64Length = Math.ceil(MAX_ATTACHMENT_RAW_BYTES / 3) * 4
  const withinBudget = {
    content: [{type: 'image', source: {type: 'data', mimeType: 'image/png', value: 'A'.repeat(largestBase64Length)}}],
  }
  expect(checkSend(withinBudget, ready)).toEqual({ok: true})
})

test('says the engine is unreachable instead of swallowing the message', () => {
  const verdict = checkSend('rename the widget package', {busy: false, reachable: false})
  expect(verdict).toEqual({
    ok: false,
    message: 'conciv lost connection to the engine. Your message is still in the composer.',
    tone: 'warn',
  })
})
