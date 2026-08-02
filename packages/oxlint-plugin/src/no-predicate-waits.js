function isAstNode(value) {
  return typeof value?.type === 'string'
}

function isBooleanType(node) {
  if (!isAstNode(node)) return false
  if (node.type === 'TSBooleanKeyword') return true
  if (node.type === 'TSUnionType') return (node.types ?? []).some(isBooleanType)
  if (node.type !== 'TSTypeReference') return false
  if (node.typeName?.name !== 'Promise') return false
  return (node.typeArguments?.params ?? node.typeParameters?.params ?? []).some(isBooleanType)
}

function isBooleanReturningFunctionType(node) {
  if (!isAstNode(node)) return false
  if (node.type !== 'TSFunctionType') return false
  return isBooleanType(node.returnType?.typeAnnotation)
}

function findPredicateType(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPredicateType(item)
      if (found) return found
    }
    return undefined
  }
  if (!isAstNode(value)) return undefined
  if (isBooleanReturningFunctionType(value)) return value
  for (const [key, child] of Object.entries(value)) {
    if (key === 'parent') continue
    const found = findPredicateType(child)
    if (found) return found
  }
  return undefined
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
