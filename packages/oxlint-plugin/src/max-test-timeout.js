import {isIdentifier, readCalleeName, walk} from './ast-walk.js'
import {DATA_MATCHERS} from './test-time.js'

const CAPS = {expect: 10_000, test: 30_000}
const SLOW_FACTOR = 3
const RESOLVE_DEPTH = 8
const TEST_NAMES = ['test', 'it', 'describe']
const TEST_INFO_OWNERS = ['test', 'testInfo']
const VITEST_TIMEOUT_KEYS = ['testTimeout', 'hookTimeout']
const CONFIG_CALLS = ['defineConfig', 'defineProject']
const MATCHER = /^to[A-Z]/
const TYPE_WRAPPERS = ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression']
const FUNCTION_TYPES = ['ArrowFunctionExpression', 'FunctionExpression']
const ARITHMETIC = {
  '+': (left, right) => left + right,
  '-': (left, right) => left - right,
  '*': (left, right) => left * right,
  '/': (left, right) => left / right,
}

function readKeyName(property) {
  if (property.computed) return undefined
  if (isIdentifier(property.key)) return property.key.name
  if (property.key.type === 'Literal') return property.key.value
  return undefined
}

function readRootName(node) {
  if (isIdentifier(node)) return node.name
  if (node?.type === 'MemberExpression') return readRootName(node.object)
  if (node?.type === 'CallExpression') return readRootName(node.callee)
  return undefined
}

function unwrap(node) {
  if (TYPE_WRAPPERS.includes(node?.type)) return unwrap(node.expression)
  return node
}

function resolveVariable(identifier, sourceCode) {
  const reference = sourceCode.getScope(identifier).references.find((entry) => entry.identifier === identifier)
  return reference?.resolved
}

function readConstInit(identifier, sourceCode) {
  const definition = resolveVariable(identifier, sourceCode)?.defs[0]
  if (definition?.type !== 'Variable' || definition.parent.kind !== 'const') return undefined
  return definition.node.init ?? undefined
}

function resolveBinary(node, sourceCode, depth) {
  const operate = ARITHMETIC[node.operator]
  if (!operate) return undefined
  const left = resolveNumber(node.left, sourceCode, depth)
  const right = resolveNumber(node.right, sourceCode, depth)
  if (left === undefined || right === undefined) return undefined
  return operate(left, right)
}

function resolveUnary(node, sourceCode, depth) {
  if (node.operator !== '-') return undefined
  const value = resolveNumber(node.argument, sourceCode, depth)
  return value === undefined ? undefined : -value
}

function resolveLiteral(node) {
  return typeof node.value === 'number' ? node.value : undefined
}

function resolveIdentifier(node, sourceCode, depth) {
  return resolveNumber(readConstInit(node, sourceCode), sourceCode, depth)
}

const RESOLVERS = {
  Literal: resolveLiteral,
  Identifier: resolveIdentifier,
  BinaryExpression: resolveBinary,
  UnaryExpression: resolveUnary,
}

function resolveNumber(value, sourceCode, depth = 0) {
  const node = unwrap(value)
  const resolve = RESOLVERS[node?.type]
  if (depth > RESOLVE_DEPTH || !resolve) return undefined
  return resolve(node, sourceCode, depth + 1)
}

function isSpreadIntoConfig(reference, sourceCode, depth) {
  const spread = reference.identifier.parent
  if (spread?.type !== 'SpreadElement' || spread.parent?.type !== 'ObjectExpression') return false
  return isConfigObject(spread.parent, sourceCode, depth + 1)
}

function isSpreadConstConfig(declarator, sourceCode, depth) {
  if (declarator.parent?.kind !== 'const' || !isIdentifier(declarator.id)) return false
  const variable = sourceCode.getDeclaredVariables(declarator)[0]
  return variable?.references.some((reference) => isSpreadIntoConfig(reference, sourceCode, depth)) ?? false
}

function isProjectEntry(array, sourceCode, depth) {
  const property = array.parent
  if (property?.type !== 'Property' || readKeyName(property) !== 'projects') return false
  return isConfigObject(property.parent, sourceCode, depth + 1)
}

function isConfigValue(node, depth) {
  const parent = node.parent
  if (depth > RESOLVE_DEPTH || !parent) return false
  if (parent.type === 'AwaitExpression') return isConfigValue(parent, depth + 1)
  if (parent.type === 'ExportDefaultDeclaration') return true
  return parent.type === 'CallExpression' && parent.arguments.includes(node) && isConfigCall(parent, depth + 1)
}

function isConfigCall(call, depth) {
  return CONFIG_CALLS.includes(readCalleeName(call.callee)) || isConfigValue(call, depth)
}

function isConfigObject(object, sourceCode, depth = 0) {
  const parent = object.parent
  if (depth > RESOLVE_DEPTH || !parent) return false
  if (parent.type === 'ExportDefaultDeclaration') return true
  if (parent.type === 'CallExpression') return parent.arguments.includes(object) && isConfigCall(parent, depth)
  if (parent.type === 'ArrayExpression') return isProjectEntry(parent, sourceCode, depth)
  if (parent.type === 'VariableDeclarator' && parent.init === object) {
    return isSpreadConstConfig(parent, sourceCode, depth)
  }
  return false
}

function isTestCall(call) {
  return TEST_NAMES.includes(readRootName(call.callee))
}

function isExpectMatcherCall(call) {
  const callee = call.callee
  if (callee.type !== 'MemberExpression' || readRootName(callee) !== 'expect') return false
  if (isIdentifier(callee.object)) return true
  const name = readCalleeName(callee) ?? ''
  return MATCHER.test(name) && !DATA_MATCHERS.includes(name)
}

function readCallOptionKind(object) {
  const call = object.parent
  if (call?.type !== 'CallExpression' || !call.arguments.includes(object)) return undefined
  if (isTestCall(call)) return 'test'
  if (isExpectMatcherCall(call)) return 'expect'
  return undefined
}

function isValueOfKey(object, key) {
  const holder = object?.parent
  return holder?.type === 'Property' && holder.value === object && readKeyName(holder) === key
}

function readTimeoutKind(object, sourceCode) {
  if (isValueOfKey(object, 'expect')) return 'expect'
  if (isValueOfKey(object, 'poll') && isValueOfKey(object.parent.parent, 'expect')) return 'expect'
  if (isConfigObject(object, sourceCode)) return 'test'
  return readCallOptionKind(object)
}

function classifyProperty(property, sourceCode) {
  const name = readKeyName(property)
  if (VITEST_TIMEOUT_KEYS.includes(name)) return {node: property.value, kind: 'test'}
  if (name !== 'timeout' || property.parent?.type !== 'ObjectExpression') return undefined
  const kind = readTimeoutKind(property.parent, sourceCode)
  return kind && {node: property.value, kind}
}

function isTestInfoCall(call, name) {
  return readCalleeName(call.callee) === name && TEST_INFO_OWNERS.includes(readRootName(call.callee))
}

function readPositionalTimeout(call) {
  const [, second, third] = call.arguments
  if (third === undefined || second?.type === 'ObjectExpression') return undefined
  if (FUNCTION_TYPES.includes(third.type) || third.type === 'ObjectExpression') return undefined
  return third
}

function classifyCall(call) {
  if (call.callee.type === 'MemberExpression' && isTestInfoCall(call, 'setTimeout')) {
    return call.arguments[0] && {node: call.arguments[0], kind: 'test'}
  }
  if (!isTestCall(call) || isTestInfoCall(call, 'slow')) return undefined
  const timeout = readPositionalTimeout(call)
  return timeout && {node: timeout, kind: 'test'}
}

function classifyNode(node, sourceCode) {
  if (node.type === 'Property') return classifyProperty(node, sourceCode)
  if (node.type === 'CallExpression') return classifyCall(node)
  return undefined
}

function readFileTestTimeouts(sourceCode) {
  const found = []
  walk(sourceCode.ast, (node) => {
    const timeout = classifyNode(node, sourceCode)
    if (timeout?.kind === 'test') found.push(resolveNumber(timeout.node, sourceCode))
  })
  return found
}

function reportTimeout(timeout, context) {
  const cap = CAPS[timeout.kind]
  const value = resolveNumber(timeout.node, context.sourceCode)
  const data = {kind: timeout.kind, cap: String(cap)}
  if (value === undefined) return context.report({node: timeout.node, messageId: 'unresolvable', data})
  if (value <= 0) {
    return context.report({node: timeout.node, messageId: 'disabled', data: {...data, value: String(value)}})
  }
  if (value <= cap) return
  context.report({node: timeout.node, messageId: 'overCap', data: {...data, value: String(value)}})
}

function reportSlow(call, context) {
  const timeouts = readFileTestTimeouts(context.sourceCode)
  const data = {cap: String(CAPS.test)}
  if (timeouts.length === 0 || timeouts.includes(undefined)) {
    return context.report({node: call, messageId: 'slowUnresolvable', data})
  }
  const tripled = Math.max(...timeouts) * SLOW_FACTOR
  if (tripled <= CAPS.test) return
  context.report({node: call, messageId: 'slowOverCap', data: {...data, value: String(tripled)}})
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Caps every test-side timeout: an expect timeout (a timeout key under expect, or in the options of expect.poll, expect.element or a retrying matcher) at 10000 ms, and a test timeout (a Playwright config or project timeout, vitest testTimeout and hookTimeout, a test, it or describe timeout option or numeric third argument, test.setTimeout) at 30000 ms. A value must be a number literal, a same-file const holding one, or arithmetic of those; anything else, Infinity and Number constants included, is reported as unresolvable. A value of 0 or below turns the timeout off, so it is reported too. test.slow() triples the test timeout, so it is reported unless the same file sets every test timeout it holds to a resolvable value whose triple stays within 30000 ms; a file that sets none leaves the timeout to the config, which the rule cannot read, and is reported as unresolvable. A timeout outside expect or test config (webServer, page.goto, launch options) is server or page time and is never reported.',
    },
    messages: {
      overCap:
        'This {{kind}} timeout is {{value}} ms, above the {{cap}} ms cap. A test that needs longer is waiting on something it should await or speed up; lower the value.',
      disabled:
        'This {{kind}} timeout is {{value}}, which disables the timeout; the cap is {{cap}} ms. Set a positive number within the cap.',
      unresolvable:
        'This {{kind}} timeout is not a number the rule can check against the {{cap}} ms cap. Write a number literal or a same-file const holding one.',
      slowOverCap:
        'test.slow() triples the test timeout to {{value}} ms, above the {{cap}} ms cap. Remove it, or set this file to a test timeout whose triple stays within the cap.',
      slowUnresolvable:
        'test.slow() triples a test timeout this file does not set as a checkable number, so the result cannot be held to the {{cap}} ms cap. Remove it, or set the file test timeout with test.setTimeout to a number literal or const.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      Property(node) {
        const timeout = classifyProperty(node, context.sourceCode)
        if (timeout) reportTimeout(timeout, context)
      },
      CallExpression(node) {
        if (isTestInfoCall(node, 'slow')) return reportSlow(node, context)
        const timeout = classifyCall(node)
        if (timeout) reportTimeout(timeout, context)
      },
    }
  },
}
