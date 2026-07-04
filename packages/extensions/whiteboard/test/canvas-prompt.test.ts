import {expect, test} from 'vitest'
import {WHITEBOARD_PROMPT} from '../src/shared/meta.js'
import {canvasTools} from '../src/tool/canvas/server.js'

test('prompt teaches the draft loop in order', () => {
  const loop = ['canvas.svg', 'canvas.preview', 'canvas.export', 'canvas.commit']
  const positions = loop.map((name) => WHITEBOARD_PROMPT.indexOf(name))
  positions.forEach((position) => expect(position).toBeGreaterThan(-1))
  expect([...positions]).toEqual([...positions].sort((left, right) => left - right))
})

test('prompt routes styles', () => {
  expect(WHITEBOARD_PROMPT).toMatch(/hatch/i)
  expect(WHITEBOARD_PROMPT).toMatch(/flat fills?/i)
  expect(WHITEBOARD_PROMPT).toMatch(/reference/i)
})

test('every canvas tool ships a prompt snippet', () => {
  canvasTools.forEach((tool) => expect(tool.promptSnippet, tool.name).toBeTruthy())
})
