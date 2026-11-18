import {isIdentifier, isNode, walk} from './ast-walk.js'

const SOLID_MODULE = 'solid-js'
const CREATE_RESOURCE = 'createResource'
const RPC_PROPERTY = 'rpc'
const CLIENT_NAME = 'client'
const EVENTS_PROPERTY = 'events'

function propertyName(member) {
  if (member.computed !== true && isIdentifier(member.property)) return member.property.name
  if (isNode(member.property) && member.property.type === 'Literal') return String(member.property.value)
  return undefined
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

function returnedExpression(value) {
  if (!isNode(value) || value.type !== 'ArrowFunctionExpression') return undefined
  if (value.body.type !== 'BlockStatement') return value.body
  const returned = value.body.body.find((statement) => statement.type === 'ReturnStatement')
  return returned?.argument ?? undefined
}

function collectBindings(program) {
  const values = []
  const factories = []
  walk(program, (node) => {
    if (node.type !== 'VariableDeclarator' || !isIdentifier(node.id)) return
    if (isRpcCall(node.init)) values.push(node.id.name)
    if (isRpcCall(returnedExpression(node.init))) factories.push(node.id.name)
  })
  return {values, factories}
}

function isRpcClient(value, bindings) {
  if (isRpcCall(value)) return true
  if (isIdentifier(value)) return bindings.values.includes(value.name)
  return isCall(value) && isIdentifier(value.callee) && bindings.factories.includes(value.callee.name)
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

function checkProgram(program, context) {
  const bindings = collectBindings(program)
  walk(program, (node) => {
    reportResourceImport(node, context)
    reportMethodCall(node, bindings, context)
    reportDestructured(node, bindings, context)
  })
}

export default {
  meta: {
    type: 'problem',
    messages: {
      plainCall:
        "A plugin view calls the rpc method '{{method}}' directly. Read it through `useQuery(() => client.method.queryOptions({input}))`, write through `useMutation(() => client.method.mutationOptions())`, and invalidate on events with `ctx.queryClient.invalidateQueries({queryKey: client.method.key()})`. Plain calls belong in engine code and browser `.ts` model files.",
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
