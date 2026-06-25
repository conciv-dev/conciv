import {expect, test} from 'vitest'
import type {ToolCallPart} from '@tanstack/ai-client'
import {nowTitle} from '../src/now-title.js'

function callPart(name: string, input: unknown): ToolCallPart {
  return {type: 'tool-call', id: '1', name, input} as ToolCallPart
}

test('an extension-supplied title wins by tool name', () => {
  expect(nowTitle(callPart('test_runner_run', {}), {test_runner_run: 'Running tests'})).toBe('Running tests')
})

test('falls back to the built-in label when no map entry exists', () => {
  expect(nowTitle(callPart('Bash', {command: 'ls'}))).toBe('Running ls')
})
