import {isIdentifier, isNode, walk} from './ast-walk.js'

const SOLID_MODULE = 'solid-js'
const CREATE_RESOURCE = 'createResource'
const RPC_PROPERTY = 'rpc'
const CLIENT_NAME = 'client'
const EVENTS_PROPERTY = 'events'
const RAW_OWNERS = ['plugin', RPC_PROPERTY]
const RAW_CALL = 'call'

function keyName(key, computed) {
  if (computed !== true && isIdentifier(key)) return key.name
  if (isNode(key) && key.type === 'Literal') return String(key.value)
  return undefined
}

function propertyName(member) {
  return keyName(member.property, member.computed)
}

function isMember(value) {
  return isNode(value) && value.type === 'MemberExpression'
}

function isCall(value) {
  return isNode(value) && value.type === 'CallExpression'
}

function isClient(value) {
  if (isIdentifier(value)) return value.name === CLIENT_NAME
  return isMember(value) && propertyName(value) === CLIENT_NAME
}

function isRpcCall(value) {
  return (
    isCall(value) &&
    isMember(value.callee) &&
    propertyName(value.callee) === RPC_PROPERTY &&
    isClient(value.callee.object)
  )
}

function isRawCall(value) {
  return (
    isCall(value) &&
    isMember(value.callee) &&
    propertyName(value.callee) === RAW_CALL &&
    isMember(value.callee.object) &&
    RAW_OWNERS.includes(propertyName(value.callee.object)) &&
    isClient(value.callee.object.object)
  )
}

function returnedExpression(value) {
  if (!isNode(value) || value.type !== 'ArrowFunctionExpression') return undefined
  if (value.body.type !== 'BlockStatement') return value.body
  const returned = value.body.body.find((statement) => statement.type === 'ReturnStatement')
  return returned?.argument ?? undefined
}

function collectClients(program) {
  const values = []
  const factories = []
  walk(program, (node) => {
    if (node.type !== 'VariableDeclarator' || !isIdentifier(node.id)) return
    if (isRpcCall(node.init)) values.push(node.id.name)
    if (isRpcCall(returnedExpression(node.init))) factories.push(node.id.name)
  })
  return {values, factories}
}

function patternMethods(pattern) {
  return pattern.properties
    .filter((property) => property.type === 'Property' && isIdentifier(property.value))
    .map((property) => ({name: property.value.name, method: keyName(property.key, property.computed)}))
}

function collectMethods(program, clients) {
  const methods = []
  walk(program, (node) => {
    if (node.type !== 'VariableDeclarator') return
    if (isNode(node.id) && node.id.type === 'ObjectPattern' && isRpcClient(node.init, clients))
      methods.push(...patternMethods(node.id))
    if (isIdentifier(node.id) && isMember(node.init) && isRpcClient(node.init.object, clients)) {
      const method = propertyName(node.init)
      if (method !== EVENTS_PROPERTY) methods.push({name: node.id.name, method})
    }
  })
  return methods
}

function collectBindings(program) {
  const clients = collectClients(program)
  return {...clients, methods: collectMethods(program, clients)}
}

function isRpcClient(value, bindings) {
  if (isRpcCall(value)) return true
  if (isIdentifier(value)) return bindings.values.includes(value.name)
  return isCall(value) && isIdentifier(value.callee) && bindings.factories.includes(value.callee.name)
}

function reportAliasedCall(node, bindings, context) {
  if (!isCall(node) || !isIdentifier(node.callee)) return
  const aliased = bindings.methods.find((method) => method.name === node.callee.name)
  if (aliased) context.report({node, messageId: 'plainCall', data: {method: aliased.method ?? 'a method'}})
}

function reportRawCall(node, context) {
  if (isRawCall(node)) context.report({node, messageId: 'rawCall'})
}

function reportMethodCall(node, bindings, context) {
  if (!isCall(node) || !isMember(node.callee) || !isRpcClient(node.callee.object, bindings)) return
  const method = propertyName(node.callee) ?? 'a method'
  if (method === EVENTS_PROPERTY) return
  context.report({node, messageId: 'plainCall', data: {method}})
}

function reportDestructured(node, bindings, context) {
  if (node.type !== 'VariableDeclarator' || !isNode(node.id) || node.id.type !== 'ObjectPattern') return
  if (isRpcClient(node.init, bindings)) context.report({node, messageId: 'destructured'})
}

function reportResourceImport(node, context) {
  if (node.type !== 'ImportDeclaration' || node.source.value !== SOLID_MODULE) return
  node.specifiers
    .filter((specifier) => specifier.type === 'ImportSpecifier' && specifier.imported.name === CREATE_RESOURCE)
    .forEach((specifier) => context.report({node: specifier, messageId: 'createResource'}))
}

function collectSolidNamespaces(program) {
  const namespaces = []
  walk(program, (node) => {
    if (node.type !== 'ImportDeclaration' || node.source.value !== SOLID_MODULE) return
    node.specifiers
      .filter((specifier) => specifier.type === 'ImportNamespaceSpecifier')
      .forEach((specifier) => namespaces.push(specifier.local.name))
  })
  return namespaces
}

function reportNamespacedResource(node, namespaces, context) {
  if (!isMember(node) || propertyName(node) !== CREATE_RESOURCE) return
  if (isIdentifier(node.object) && namespaces.includes(node.object.name))
    context.report({node, messageId: 'createResource'})
}

function checkProgram(program, context) {
  const bindings = collectBindings(program)
  const namespaces = collectSolidNamespaces(program)
  walk(program, (node) => {
    reportResourceImport(node, context)
    reportNamespacedResource(node, namespaces, context)
    reportRawCall(node, context)
    reportMethodCall(node, bindings, context)
    reportAliasedCall(node, bindings, context)
    reportDestructured(node, bindings, context)
  })
}

export default {
  meta: {
    type: 'problem',
    messages: {
      plainCall:
        "A plugin view calls the rpc method '{{method}}' directly. Read it through `useQuery(() => client.method.queryOptions({input}))`, write through `useMutation(() => client.method.mutationOptions())`, and invalidate on events with `ctx.queryClient.invalidateQueries({queryKey: client.method.key()})`. Plain calls belong in engine code and browser `.ts` model files.",
      rawCall:
        'A plugin view makes a raw plugin call. Read the method through `useQuery(() => ctx.client.rpc(Definition).method.queryOptions({input}))` and write through its `mutationOptions`; the raw wire belongs in engine code and browser `.ts` model files.',
      destructured:
        'A plugin view takes methods out of an rpc client. Keep the client whole and read each method through `queryOptions`, write through `mutationOptions`.',
      createResource:
        'A plugin view never uses createResource. An rpc read is `useQuery(() => client.method.queryOptions({input}))`, a lazy import is a Solid `lazy()` component or a query.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      Program(program) {
        checkProgram(program, context)
      },
    }
  },
}
