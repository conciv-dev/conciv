import {isIdentifier, isNode} from './ast-walk.js'

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const TEST_NAMES = ['describe', 'test', 'it']
const MODIFIER_NAMES = [
  'describe',
  'each',
  'for',
  'skip',
  'only',
  'todo',
  'skipIf',
  'runIf',
  'concurrent',
  'sequential',
  'fails',
  'fixme',
  'serial',
  'parallel',
]
const RULE_TESTER_NAME = 'RuleTester'
const RUN_NAME = 'run'

function isStaticMember(node) {
  return isNode(node) && node.type === 'MemberExpression' && node.computed !== true && isIdentifier(node.property)
}

function isTestCallee(callee) {
  if (isIdentifier(callee)) return TEST_NAMES.includes(callee.name)
  if (isNode(callee) && callee.type === 'CallExpression') return isTestCallee(callee.callee)
  if (!isStaticMember(callee) || !MODIFIER_NAMES.includes(callee.property.name)) return false
  return isTestCallee(callee.object)
}

function isTestCall(statement) {
  if (statement.type !== 'ExpressionStatement') return false
  const call = statement.expression
  return call.type === 'CallExpression' && isTestCallee(call.callee)
}

function isAllowed(statement) {
  return statement.type === 'ImportDeclaration' || isTestCall(statement)
}

function isRuleTesterConstruction(init) {
  return (
    isNode(init) && init.type === 'NewExpression' && isIdentifier(init.callee) && init.callee.name === RULE_TESTER_NAME
  )
}

function readRuleTesterNames(statement) {
  if (statement.type !== 'VariableDeclaration') return []
  return statement.declarations
    .filter((declarator) => isIdentifier(declarator.id) && isRuleTesterConstruction(declarator.init))
    .map((declarator) => declarator.id.name)
}

function readRunReceiver(statement) {
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'CallExpression') return undefined
  const callee = statement.expression.callee
  if (!isStaticMember(callee) || callee.property.name !== RUN_NAME || !isIdentifier(callee.object)) return undefined
  return callee.object.name
}

function isRuleTesterFile(body) {
  const testers = new Set(body.flatMap(readRuleTesterNames))
  return body.some((statement) => testers.has(readRunReceiver(statement)))
}

export default {
  meta: {
    type: 'problem',
    messages: {
      topLevel:
        "A test file's top level holds only imports and describe, test or it calls. Move this into the test that uses it, or into its describe when several of that describe's tests use it; a fixture several files share lives once in a module in the package's test folder that each test file imports.",
    },
    schema: [],
  },
  createOnce(context) {
    return {
      Program(node) {
        if (!TEST_FILE.test(context.filename)) return
        if (isRuleTesterFile(node.body)) return
        for (const statement of node.body) {
          if (!isAllowed(statement)) context.report({node: statement, messageId: 'topLevel'})
        }
      },
    }
  },
}
