import {isIdentifier, isNode} from './ast-walk.js'

const DATABASE_NAME = 'db'
const QUERY_METHODS = [
  'select',
  'selectDistinct',
  'selectDistinctOn',
  'insert',
  'update',
  'delete',
  'transaction',
  'run',
  'all',
  'get',
  'values',
  'query',
  'execute',
  '$count',
]

function isPlainMember(node) {
  return isNode(node) && node.type === 'MemberExpression' && !node.computed && isIdentifier(node.property)
}

function isDatabase(node) {
  if (isIdentifier(node)) return node.name === DATABASE_NAME
  return isPlainMember(node) && node.property.name === DATABASE_NAME
}

function isQueryMember(node) {
  return isPlainMember(node) && QUERY_METHODS.includes(node.property.name) && isDatabase(node.object)
}

const PROMISE_RUNNERS = ['runPromise', 'runPromiseExit', 'runPromiseWith', 'runPromiseExitWith']

function isPromiseRunner(node) {
  if (isNode(node) && node.type === 'CallExpression') return isPromiseRunner(node.callee)
  return isPlainMember(node) && PROMISE_RUNNERS.includes(node.property.name)
}

function isPipedToPromise(node) {
  return (
    node.type === 'CallExpression' &&
    isPlainMember(node.callee) &&
    node.callee.property.name === 'pipe' &&
    isPromiseRunner(node.arguments.at(-1))
  )
}

function nextInChain(node) {
  if (node.type === 'CallExpression') return node.callee
  if (node.type === 'MemberExpression') return node.object
  if (node.type === 'ChainExpression') return node.expression
  return undefined
}

function isQueryChain(node) {
  if (!isNode(node)) return false
  if (isPipedToPromise(node)) return false
  if (isQueryMember(node)) return true
  return isQueryChain(nextInChain(node))
}

export default {
  meta: {
    type: 'problem',
    messages: {
      awaitedQuery:
        'An Effect drizzle query builder is not a promise: awaiting it compiles and runs nothing. Run it with `await Effect.runPromise(query)`, or `yield* query` inside Effect.gen.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      AwaitExpression(node) {
        if (isQueryChain(node.argument)) context.report({node, messageId: 'awaitedQuery'})
      },
    }
  },
}
