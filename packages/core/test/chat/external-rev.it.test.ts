import {rmSync} from 'node:fs'
import {afterEach, describe, expect, it} from 'vitest'
import {EventType} from '@tanstack/ai'
import {attachLive} from '../../src/chat/attach.js'
import {makeChatFixture, type ChatFixture} from '../helpers/chat-fixture.js'

const fixtures: ChatFixture[] = []

async function attached() {
  const fixture = await makeChatFixture()
  fixtures.push(fixture)
  const controller = new AbortController()
  const stream = attachLive(fixture.chat, fixture.sessionId, controller.signal)
  return {fixture, stream, stop: () => controller.abort()}
}

describe('external transcript wake', () => {
  afterEach(() => {
    for (const fixture of fixtures.splice(0)) rmSync(fixture.stateRoot, {recursive: true, force: true})
  })

  it('re-sends the snapshot when an external change is announced', async () => {
    const {fixture, stream, stop} = await attached()
    const first = await stream.next()
    expect(first.value?.type).toBe(EventType.MESSAGES_SNAPSHOT)

    fixture.chat.changes.bumpExternal()
    const second = await stream.next()
    expect(second.value?.type).toBe(EventType.MESSAGES_SNAPSHOT)
    stop()
  })

  it('stays quiet when nothing changed', async () => {
    const {fixture, stream, stop} = await attached()
    await stream.next()

    fixture.chat.changes.notify()
    setTimeout(stop, 100)
    expect((await stream.next()).done).toBe(true)
  })
})
