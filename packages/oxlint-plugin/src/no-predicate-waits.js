function isAstNode(value) {
  return typeof value?.type === 'string'
}

function typeArgumentsOf(node) {
  const holder = node.typeArguments ?? node.typeParameters
  if (!holder) return []
  return holder.params ?? []
}

function isPromiseOfBoolean(node) {
  if (node.typeName?.name !== 'Promise') return false
  return typeArgumentsOf(node).some(isBooleanType)
}

function isBooleanUnion(node) {
  return typesOf(node).some(isBooleanType)
}

function typesOf(node) {
  return node.types ?? []
}

const BOOLEAN_TYPE_CHECKS = {
  TSBooleanKeyword: () => true,
  TSUnionType: isBooleanUnion,
  TSTypeReference: isPromiseOfBoolean,
}

function isBooleanType(node) {
  if (!isAstNode(node)) return false
  const check = BOOLEAN_TYPE_CHECKS[node.type]
  if (!check) return false
  return check(node)
}

function returnTypeOf(node) {
  return node.returnType?.typeAnnotation
}

function isBooleanReturningFunctionType(node) {
  if (node.type !== 'TSFunctionType') return false
  return isBooleanType(returnTypeOf(node))
}

function searchList(items) {
  for (const item of items) {
    const found = findPredicateType(item)
    if (found) return found
  }
  return undefined
}

function searchChildren(node) {
  for (const [key, child] of Object.entries(node)) {
    if (key === 'parent') continue
    const found = findPredicateType(child)
    if (found) return found
  }
  return undefined
}

function findPredicateType(value) {
  if (Array.isArray(value)) return searchList(value)
  if (!isAstNode(value)) return undefined
  if (isBooleanReturningFunctionType(value)) return value
  return searchChildren(value)
}

export default {
  meta: {
    type: 'problem',
    messages: {
      noPredicateWait:
        'An exported testkit surface must not take a boolean-returning function. A predicate parameter turns an assertion into a wait; return the awaited value and let the test assert on it.',
    },
    schema: [],
  },
  createOnce(context) {
    return {
      ExportNamedDeclaration(node) {
        const found = findPredicateType(node.declaration)
        if (!found) return
        context.report({node: found, messageId: 'noPredicateWait'})
      },
    }
  },
}
