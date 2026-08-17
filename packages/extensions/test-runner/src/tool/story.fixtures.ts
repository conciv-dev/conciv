import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import type {TestRunResult} from '../shared/events.js'

export const STORY_FRAME_CLASS =
  'chat-theme-dark p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

export const TEST_TOOL_NAME = 'test_runner'

export const storyAddResult = INERT_ADD_RESULT

export const TEST_TOOL_META: ToolViewMeta = {
  summary: 'drive the live test runner: list, run a pattern, or check status',
  category: 'test-runner',
  icon: 'script',
  label: {running: 'Running the tests', done: 'Ran the tests'},
  mutating: false,
  mirrors: false,
}

export function storyCtx(): ToolViewCtx {
  const catalog: ToolCatalogView = {
    loaded: () => true,
    meta: (name) => (name === TEST_TOOL_NAME ? TEST_TOOL_META : undefined),
  }
  return {...INERT_TOOL_CTX, catalog}
}

export function storyPart(state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  const input = {action: 'run'}
  return {type: 'tool-call', id: 's1', name: TEST_TOOL_NAME, arguments: JSON.stringify(input), input, state}
}

export function storyResult(payload: TestRunResult): ToolResultPart {
  return {type: 'tool-result', toolCallId: 's1', content: JSON.stringify(payload), state: 'complete'}
}

const MATH_FILE = '/proj/src/math.test.ts'
const CART_FILE = '/proj/src/cart.test.ts'

const CART_FAILURE = {
  file: CART_FILE,
  name: 'applies the bulk discount',
  message: 'expected 90 to be 85 // Object.is equality\n\n- Expected\n+ Received\n\n- 85\n+ 90',
  stack: 'at applyDiscount (src/cart.ts:42:11)\nat src/cart.test.ts:18:5',
  line: 18,
}

export const PASSING_RUN: TestRunResult = {
  summary: {passed: 3, failed: 0, skipped: 1, durationMs: 412},
  failures: [],
  tests: [
    {id: 'math-adds', file: MATH_FILE, name: 'adds two numbers', state: 'pass', durationMs: 2},
    {id: 'math-subtracts', file: MATH_FILE, name: 'subtracts two numbers', state: 'pass', durationMs: 1},
    {id: 'cart-empty', file: CART_FILE, name: 'totals an empty cart', state: 'pass', durationMs: 3},
    {id: 'cart-loyalty', file: CART_FILE, name: 'applies the loyalty discount', state: 'skip', durationMs: 0},
  ],
}

export const FAILING_RUN: TestRunResult = {
  summary: {passed: 2, failed: 1, skipped: 1, durationMs: 638},
  failures: [CART_FAILURE],
  tests: [
    {id: 'math-adds', file: MATH_FILE, name: 'adds two numbers', state: 'pass', durationMs: 2},
    {id: 'math-subtracts', file: MATH_FILE, name: 'subtracts two numbers', state: 'pass', durationMs: 1},
    {
      id: 'cart-bulk',
      file: CART_FILE,
      name: 'applies the bulk discount',
      state: 'fail',
      durationMs: 4,
      error: CART_FAILURE,
    },
    {id: 'cart-loyalty', file: CART_FILE, name: 'applies the loyalty discount', state: 'skip', durationMs: 0},
  ],
}
