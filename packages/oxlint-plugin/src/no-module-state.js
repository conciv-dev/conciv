import {isIdentifier} from './ast-walk.js'

const SCRIPT_FILE = /\.[cm]?[jt]sx?$/
const NOT_PRODUCT_FILE = /\.(?:test|spec|stories|config|d)\.[cm]?[jt]sx?$/
const PRODUCT_ROOTS = ['packages', 'apps']
const NOT_PRODUCT_FOLDERS = ['test', 'tests', 'scripts', '__tests__']
const COLLECTIONS = ['Map', 'Set', 'WeakMap', 'WeakSet']
const STATEFUL_MAKER = /^(?:create|make|open)(?:[A-Z]\w*)?(?:Engine|Connection|Socket|Store|Queue|Registry)$/
const TYPE_WRAPPERS = ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression']

function isProductSource(filename) {
  const segments = filename.split(/[\\/]/)
  const base = segments.at(-1) ?? ''
  const root = segments.findIndex((segment) => PRODUCT_ROOTS.includes(segment))
  if (root === -1 || !SCRIPT_FILE.test(base) || NOT_PRODUCT_FILE.test(base) || base.includes('.config.')) return false
  const folders = segments.slice(root + 1, -1)
  return folders.includes('src') && !folders.some((segment) => NOT_PRODUCT_FOLDERS.includes(segment))
}

function unwrapTypes(node) {
  return node !== null && TYPE_WRAPPERS.includes(node.type) ? unwrapTypes(node.expression) : node
}

function isNewCollection(init) {
  const node = unwrapTypes(init)
  if (node?.type === 'ObjectExpression')
    return node.properties.some((property) => property.type === 'Property' && isNewCollection(property.value))
  return node?.type === 'NewExpression' && isIdentifier(node.callee) && COLLECTIONS.includes(node.callee.name)
}

function isStatefulCall(init) {
  const node = unwrapTypes(init)
  return node?.type === 'CallExpression' && isIdentifier(node.callee) && STATEFUL_MAKER.test(node.callee.name)
}

function readDeclaration(statement) {
  const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
  return node?.type === 'VariableDeclaration' ? node : undefined
}

function reportDeclaration(declaration, context) {
  if (declaration.kind === 'let') {
    context.report({node: declaration, messageId: 'moduleLet'})
    return
  }
  for (const declarator of declaration.declarations) {
    if (isNewCollection(declarator.init)) context.report({node: declarator, messageId: 'moduleCollection'})
    if (isStatefulCall(declarator.init)) context.report({node: declarator, messageId: 'moduleStatefulCall'})
  }
}

function isUndeclared(identifier, sourceCode) {
  const reference = sourceCode.getScope(identifier).references.find((entry) => entry.identifier === identifier)
  return (reference?.resolved?.defs.length ?? 0) === 0
}

function isGlobalThisProperty(target, sourceCode) {
  return (
    target.type === 'MemberExpression' &&
    isIdentifier(target.object) &&
    target.object.name === 'globalThis' &&
    isUndeclared(target.object, sourceCode)
  )
}

export default {
  meta: {
    type: 'problem',
    messages: {
      moduleCollection:
        'A Map, Set, WeakMap or WeakSet made at module scope, alone or inside a module object literal, is state every caller shares and no one owns. State is made by its owner (the function, plugin or service whose lifetime it has) and passed in to what reads it.',
      moduleStatefulCall:
        'An engine, connection, socket, store, queue or registry made at module scope is state every importer shares and no one owns. Make it inside the function that starts its owner (an entry start function, a plugin, a service) and pass it in to what reads it.',
      moduleLet:
        'A module-scope let is state every caller shares and no one owns. State is made by its owner (the function, plugin or service whose lifetime it has) and passed in to what reads it.',
      globalThisWrite:
        'Writing a property of globalThis makes state every module shares and no one owns. State is made by its owner (the function, plugin or service whose lifetime it has) and passed in to what reads it.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      Program(node) {
        if (!isProductSource(context.filename)) return
        for (const statement of node.body) {
          const declaration = readDeclaration(statement)
          if (declaration !== undefined) reportDeclaration(declaration, context)
        }
      },
      AssignmentExpression(node) {
        if (!isProductSource(context.filename)) return
        if (isGlobalThisProperty(node.left, context.sourceCode)) context.report({node, messageId: 'globalThisWrite'})
      },
    }
  },
}
