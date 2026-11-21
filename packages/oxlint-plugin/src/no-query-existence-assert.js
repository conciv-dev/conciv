const QUERY_PREFIXES = ['findAllBy', 'findBy', 'getAllBy', 'getBy', 'queryAllBy', 'queryBy']
const QUERY_SUFFIXES = ['AltText', 'DisplayValue', 'LabelText', 'PlaceholderText', 'Role', 'TestId', 'Text', 'Title']
const QUERY_NAMES = new Set(QUERY_PREFIXES.flatMap((prefix) => QUERY_SUFFIXES.map((suffix) => prefix + suffix)))

const EXISTENCE_MATCHERS = new Set([
  'toBeDefined',
  'toBeUndefined',
  'toBeNull',
  'toBeTruthy',
  'toBeFalsy',
  'toBeNil',
  'toBeNullable',
])
const NULL_ARGUMENT_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual'])
const LENGTH_MATCHER = 'toHaveLength'

const DOM_OR_BROWSER_TEST_FILE = /\.(?:dom|browser)\.test\.[cm]?[jt]sx?$/
const SOLID_TESTING_LIBRARY = '@solidjs/testing-library'
const TESTING_LIBRARY_SCOPE = '@testing-library/'

const WRAPPERS = new Set(['AwaitExpression', 'TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression'])

function isStaticMember(node) {
  return node?.type === 'MemberExpression' && node.computed !== true && node.property?.type === 'Identifier'
}

function isNamed(node, name) {
  return node?.type === 'Identifier' && node.name === name
}

function isTestingLibrarySource(source) {
  return source === SOLID_TESTING_LIBRARY || source.startsWith(TESTING_LIBRARY_SCOPE)
}

function importsTestingLibrary(program) {
  return program.body.some(
    (statement) => statement.type === 'ImportDeclaration' && isTestingLibrarySource(statement.source.value),
  )
}

function unwrapped(node) {
  if (node !== undefined && WRAPPERS.has(node.type)) return unwrapped(node.expression ?? node.argument)
  return node
}

function calleeName(callee) {
  if (callee?.type === 'Identifier') return callee.name
  if (isStaticMember(callee)) return callee.property.name
  return undefined
}

function queryCallName(node) {
  const call = unwrapped(node)
  if (call?.type !== 'CallExpression') return undefined
  const name = calleeName(call.callee)
  return QUERY_NAMES.has(name) ? name : undefined
}

function constInitializer(identifier, sourceCode) {
  const reference = sourceCode.getScope(identifier).references.find((entry) => entry.identifier === identifier)
  const definition = reference?.resolved?.defs[0]
  if (definition?.type !== 'Variable') return undefined
  if (definition.parent?.kind !== 'const') return undefined
  if (definition.node.id.type !== 'Identifier') return undefined
  return definition.node.init ?? undefined
}

function subjectQueryName(subject, sourceCode) {
  const direct = queryCallName(subject)
  if (direct !== undefined) return direct
  const value = unwrapped(subject)
  if (value?.type !== 'Identifier') return undefined
  const initializer = constInitializer(value, sourceCode)
  return initializer === undefined ? undefined : queryCallName(initializer)
}

function expectedSubject(node) {
  if (node?.type !== 'CallExpression' || !isNamed(node.callee, 'expect')) return undefined
  return node.arguments[0]
}

function readAssertion(matcherCall) {
  const callee = matcherCall.callee
  if (!isStaticMember(callee)) return undefined
  const matcher = callee.property.name
  const target = callee.object
  if (isStaticMember(target) && target.property.name === 'not') {
    const subject = expectedSubject(target.object)
    return subject === undefined ? undefined : {matcher: `not.${matcher}`, name: matcher, subject}
  }
  const subject = expectedSubject(target)
  return subject === undefined ? undefined : {matcher, name: matcher, subject}
}

function isNullLiteral(node) {
  return node?.type === 'Literal' && node.value === null && node.regex === undefined
}

function provesExistenceOnly(name, matcherCall, query) {
  if (EXISTENCE_MATCHERS.has(name)) return true
  if (NULL_ARGUMENT_MATCHERS.has(name)) return isNullLiteral(matcherCall.arguments[0])
  if (name === LENGTH_MATCHER) return !query.includes('AllBy')
  return false
}

function checkMatcherCall(node, context) {
  const assertion = readAssertion(node)
  if (assertion === undefined) return
  const query = subjectQueryName(assertion.subject, context.sourceCode)
  if (query === undefined) return
  if (!provesExistenceOnly(assertion.name, node, query)) return
  context.report({node, messageId: 'existenceOnly', data: {matcher: assertion.matcher, query}})
}

export default {
  meta: {
    type: 'problem',
    messages: {
      existenceOnly:
        'expect({{query}}(...)).{{matcher}}() proves nothing: a getBy/findBy query already throws when nothing matches, and a queryBy result says only whether a node exists. Assert what the user sees with a jest-dom matcher: toBeVisible(), toBeInTheDocument() (or .not.toBeInTheDocument() on a queryBy for absence), toHaveTextContent(...), toHaveAccessibleName(...), toBeDisabled() / toBeEnabled(), toHaveValue(...), toBeChecked().',
    },
    schema: [],
  },
  createOnce(context) {
    const file = {checked: false}
    return {
      Program(node) {
        file.checked = DOM_OR_BROWSER_TEST_FILE.test(context.filename) || importsTestingLibrary(node)
      },
      CallExpression(node) {
        if (!file.checked) return
        checkMatcherCall(node, context)
      },
    }
  },
}
