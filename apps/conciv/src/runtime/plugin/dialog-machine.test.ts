import {expect, test} from 'vitest'
import {
  createPluginDialogState,
  transitionPluginDialog,
  type PluginDialogEffect,
  type PluginDialogEvent,
  type PluginDialogState,
} from './dialog-machine'

function replay(events: readonly PluginDialogEvent[]) {
  return events.reduce<{state: PluginDialogState; effects: PluginDialogEffect['type'][]}>(
    (current, event) => {
      const next = transitionPluginDialog(current.state, event)

      return {state: next.state, effects: [...current.effects, ...next.effects.map((effect) => effect.type)]}
    },
    {state: createPluginDialogState(), effects: []},
  )
}

const open: PluginDialogEvent = {type: 'open', aborted: false}

test('closing a shown dialog ends it once, whatever closes it afterwards', () => {
  const run = replay([open, {type: 'mounted'}, {type: 'close'}, {type: 'dismissed'}, {type: 'close'}])

  expect(run.state.status).toBe('closed')
  expect(run.effects).toEqual(['register', 'wait', 'show', 'abort', 'close', 'release', 'ended'])
})

test.each<{name: string; events: PluginDialogEvent[]; effects: PluginDialogEffect['type'][]}>([
  {
    name: 'waits for the app interface',
    events: [open, {type: 'close'}, {type: 'mounted'}],
    effects: ['register', 'wait', 'cancel', 'release', 'ended'],
  },
  {
    name: 'waits for the stack to mount it',

    events: [open, {type: 'mounted'}, {type: 'close'}, {type: 'dismissed'}],
    effects: ['register', 'wait', 'show', 'abort', 'close', 'release', 'ended'],
  },
])('a dialog closed while it $name is released and ends once', (input) => {
  expect(replay(input.events).effects).toEqual(input.effects)
})

test('a dialog the stack dismisses ends without closing anything else', () => {
  const run = replay([open, {type: 'mounted'}, {type: 'dismissed'}, {type: 'close'}])

  expect(run.effects).toEqual(['register', 'wait', 'show', 'release', 'ended'])
})

test('a dialog asked of a plugin that went away ends at once and registers nothing', () => {
  const run = replay([{type: 'open', aborted: true}, {type: 'mounted'}, {type: 'close'}])

  expect(run.effects).toEqual(['ended'])
  expect(transitionPluginDialog(run.state, {type: 'close'}).state).toBe(run.state)
})
