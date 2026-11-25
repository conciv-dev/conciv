import {isIdentifier, readCalleeName, readMemberObjectName} from './ast-walk.js'
import {isNewLayerTestFile} from '@internal/vitest-config/test-layout'

const TIMER_NAMES = new Set(['setTimeout', 'setInterval', 'setImmediate'])
const BARE_SLEEPS = new Set(['wait', 'sleep', 'delay'])
const TIMEOUT_KEYS = new Set(['timeout', 'interval'])
const EXPECT_WAITS = new Set(['element', 'poll', 'soft'])
const TEST_NAMES = new Set(['test', 'it', 'describe'])
const LIBRARY_WAIT = /^(?:waitFor\w*|find(?:All)?By\w+)$/
const MATCHER = /^to[A-Z]/
export const DATA_MATCHERS = new Set([
  'toBe',
  'toEqual',
  'toStrictEqual',
  'toMatchObject',
  'toContain',
  'toContainEqual',
  'toHaveProperty',
  'toMatchSnapshot',
  'toMatchInlineSnapshot',
  'toSatisfy',
  'toBeOneOf',
  'toThrow',
  'toThrowError',
])

const TIMER_MESSAGE =
  '{{name}} schedules test-side time. Await the async surface the product already exposes (a callback, a stream chunk, a websocket message, a web-first assertion) instead of a timer.'

function isReadOfHostObject(node, parent) {
  if (parent?.type !== 'MemberExpression') return false
  return parent.object === node
}

function isPropertyKey(node, parent) {
  if (parent?.type !== 'Property') return false
  return parent.key === node && parent.computed !== true
}

function checkTimer(node, context) {
  if (!TIMER_NAMES.has(node.name)) return
  const parent = node.parent
  if (isReadOfHostObject(node, parent)) return
  if (isPropertyKey(node, parent)) return
  context.report({node, messageId: 'noTimer', data: {name: node.name}})
}

function isExpectWait(callee) {
  if (isIdentifier(callee)) return callee.name === 'expect'
  return readMemberObjectName(callee) === 'expect' && EXPECT_WAITS.has(readCalleeName(callee))
}

function isTestCallee(callee) {
  if (isIdentifier(callee)) return TEST_NAMES.has(callee.name)
  return TEST_NAMES.has(readMemberObjectName(callee))
}

function isWaitName(name) {
  if (LIBRARY_WAIT.test(name)) return true
  return MATCHER.test(name) && !DATA_MATCHERS.has(name)
}

function isOptionsWait(callee) {
  return isWaitName(readCalleeName(callee) ?? '') || isExpectWait(callee) || isTestCallee(callee)
}

function isSleep(callee) {
  if (isIdentifier(callee)) return BARE_SLEEPS.has(callee.name)
  return readCalleeName(callee) === 'waitForTimeout'
}

function isTimeoutKey(property) {
  return property.type === 'Property' && isIdentifier(property.key) && TIMEOUT_KEYS.has(property.key.name)
}

function findTimeoutKey(argument) {
  if (argument?.type !== 'ObjectExpression') return undefined
  return argument.properties.find(isTimeoutKey)
}

function isNumberLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'number'
}

function findTestTimeout(node) {
  const lastArgument = node.arguments.at(-1)
  if (!isTestCallee(node.callee) || !isNumberLiteral(lastArgument)) return undefined
  return lastArgument
}

function findInlineTimeout(node) {
  if (isSleep(node.callee)) return node
  if (!isOptionsWait(node.callee)) return undefined
  return findTestTimeout(node) ?? node.arguments.map(findTimeoutKey).find(Boolean)
}

export const noTimersInTests = {
  meta: {
    type: 'problem',
    messages: {noTimer: TIMER_MESSAGE},
    schema: [],
  },
  createOnce(context) {
    return {
      Identifier(node) {
        checkTimer(node, context)
      },
    }
  },
}

export const noInlineTimeouts = {
  meta: {
    type: 'problem',
    messages: {
      noTimer: `${TIMER_MESSAGE} Waits and timeouts are set once in the runner config.`,
      inlineTimeout:
        'A new-layer test file sets no wait of its own: no timeout or interval option, no per-test timeout, no wait(N) or waitForTimeout(N). The one default lives in the runner config; wait through an auto-retrying assert or the harness hold/release.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      Identifier(node) {
        if (!isNewLayerTestFile(context.filename)) return
        checkTimer(node, context)
      },
      CallExpression(node) {
        if (!isNewLayerTestFile(context.filename)) return
        const found = findInlineTimeout(node)
        if (!found) return
        context.report({node: found, messageId: 'inlineTimeout'})
      },
    }
  },
}
