const ROUTER_MODULE = '@tanstack/react-router'
const ROUTE_SCOPED_HOOKS = new Set(['useSearch', 'useNavigate', 'useParams', 'useLoaderData'])
const ROUTE_FILE = /(^|[\\/])src[\\/]routes[\\/]/
const SEARCH_SCHEMA_NAME = /SearchSchema$/
const ZOD_NAMESPACE = 'z'
const MATCHES_PROPERTY = 'matches'
const OBJECT_METHOD = 'object'
const FALLBACK_METHOD = 'catch'

function isNode(value) {
  return typeof value === 'object' && value !== null && typeof value.type === 'string'
}

function isIdentifier(value) {
  return isNode(value) && value.type === 'Identifier'
}

function walkList(items, visit) {
  for (const item of items) walk(item, visit)
}

function walkChildren(node, visit) {
  for (const [key, child] of Object.entries(node)) {
    if (key === 'parent') continue
    walk(child, visit)
  }
}

function walk(value, visit) {
  if (Array.isArray(value)) return walkList(value, visit)
  if (!isNode(value)) return
  visit(value)
  walkChildren(value, visit)
}

function memberObject(value) {
  if (!isNode(value) || value.type !== 'MemberExpression') return undefined
  return value.object
}

function staticMemberName(value) {
  const object = memberObject(value)
  if (object === undefined || value.computed === true) return undefined
  if (!isIdentifier(value.property)) return undefined
  return value.property.name
}

function calleeName(node) {
  if (node.type !== 'CallExpression') return undefined
  if (isIdentifier(node.callee)) return node.callee.name
  return staticMemberName(node.callee)
}

function callChain(value) {
  if (!isNode(value) || value.type !== 'CallExpression') return []
  return [value, ...callChain(memberObject(value.callee))]
}

function chainMethods(value) {
  return callChain(value).map((call) => staticMemberName(call.callee))
}

function chainRoot(value) {
  const innermost = callChain(value).at(-1)
  if (innermost === undefined) return undefined
  return memberObject(innermost.callee)
}

function isZodChain(value) {
  const root = chainRoot(value)
  return isIdentifier(root) && root.name === ZOD_NAMESPACE
}

function isObjectCall(call) {
  return staticMemberName(call.callee) === OBJECT_METHOD
}

function objectProperties(argumentList) {
  const [argument] = argumentList
  if (!isNode(argument) || argument.type !== 'ObjectExpression') return undefined
  return argument.properties
}

function zodObjectFields(value) {
  if (!isZodChain(value)) return undefined
  const objectCall = callChain(value).find(isObjectCall)
  if (objectCall === undefined) return undefined
  return objectProperties(objectCall.arguments)
}

function fieldName(property) {
  if (isIdentifier(property.key)) return property.key.name
  if (isNode(property.key) && property.key.type === 'Literal') return String(property.key.value)
  return undefined
}

function fieldLabel(property) {
  return fieldName(property) ?? 'field'
}

function fieldFallsBack(property) {
  if (!isZodChain(property.value)) return true
  return chainMethods(property.value).includes(FALLBACK_METHOD)
}

function isUncaughtField(property, reported) {
  if (property.type !== 'Property') return false
  if (property.computed === true) return false
  if (reported.has(property)) return false
  return !fieldFallsBack(property)
}

function reportUncaughtField(property, context, reported) {
  if (!isUncaughtField(property, reported)) return
  reported.add(property)
  context.report({node: property, messageId: 'searchFieldThrows', data: {field: fieldLabel(property)}})
}

function reportUncaughtFields(fields, context, reported) {
  for (const property of fields) reportUncaughtField(property, context, reported)
}

function importedName(specifier) {
  if (!isIdentifier(specifier.imported)) return undefined
  return specifier.imported.name
}

function reportBareHook(specifier, context) {
  if (specifier.type !== 'ImportSpecifier') return
  const name = importedName(specifier)
  if (!ROUTE_SCOPED_HOOKS.has(name)) return
  context.report({node: specifier, messageId: 'bareRouterHook', data: {name}})
}

function reportRouterImport(node, context) {
  if (node.type !== 'ImportDeclaration') return
  if (node.source.value !== ROUTER_MODULE) return
  for (const specifier of node.specifiers) reportBareHook(specifier, context)
}

function checkBareRouterHooks(program, context) {
  if (!ROUTE_FILE.test(context.filename)) return
  walk(program, (node) => reportRouterImport(node, context))
}

function readsMatches(value) {
  let found = false
  walk(value, (node) => {
    if (staticMemberName(node) === MATCHES_PROPERTY) found = true
  })
  return found
}

function reportMatchesMining(node, context) {
  if (calleeName(node) !== 'useRouterState') return
  if (!readsMatches(node.arguments)) return
  context.report({node, messageId: 'matchesMining'})
}

function checkMatchesMining(program, context) {
  walk(program, (node) => reportMatchesMining(node, context))
}

function collectSchema(node, schemas) {
  if (node.type !== 'VariableDeclarator') return
  if (!isIdentifier(node.id)) return
  const fields = zodObjectFields(node.init)
  if (fields === undefined) return
  schemas.set(node.id.name, fields)
}

function declaredSchemas(program) {
  const schemas = new Map()
  walk(program, (node) => collectSchema(node, schemas))
  return schemas
}

function referencedSchema(value, schemas) {
  if (!isIdentifier(value)) return undefined
  return schemas.get(value.name)
}

function validateSearchFields(node, schemas) {
  return zodObjectFields(node.value) ?? referencedSchema(node.value, schemas)
}

function reportValidateSearch(node, schemas, context, reported) {
  if (node.type !== 'Property') return
  if (fieldName(node) !== 'validateSearch') return
  const fields = validateSearchFields(node, schemas)
  if (fields === undefined) return
  reportUncaughtFields(fields, context, reported)
}

function reportNamedSchema(name, fields, context, reported) {
  if (!SEARCH_SCHEMA_NAME.test(name)) return
  reportUncaughtFields(fields, context, reported)
}

function checkSearchSchemas(program, context) {
  const schemas = declaredSchemas(program)
  const reported = new Set()
  walk(program, (node) => reportValidateSearch(node, schemas, context, reported))
  for (const [name, fields] of schemas) reportNamedSchema(name, fields, context, reported)
}

export default {
  meta: {
    type: 'problem',
    messages: {
      bareRouterHook:
        "Route files must use route-scoped router APIs: replace the bare `{{name}}` import from '@tanstack/react-router' with `Route.{{name}}()`, or `getRouteApi('/path').{{name}}()` in a split component.",
      matchesMining:
        'Mining `useRouterState().matches` reimplements route matching. Read the param where it is declared with `useSearch({strict: false})`, or ask the router with `router.matchRoutes`.',
      searchFieldThrows:
        'validateSearch must never throw: give search param `{{field}}` a `.catch(...)` fallback (alongside `.default()` or `.optional()`) so a bad URL degrades instead of erroring.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      Program(program) {
        checkBareRouterHooks(program, context)
        checkMatchesMining(program, context)
        checkSearchSchemas(program, context)
      },
    }
  },
}
