import {isIdentifier, isNode} from './ast-walk.js'

const CREATE_SIGNAL = 'createSignal'
const REF_ATTRIBUTE = 'ref'
const HANDLER_ATTRIBUTE = /^on[A-Z]/
const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'])

function visitEntry(value, parent, visit) {
  if (Array.isArray(value)) {
    for (const item of value) visitEntry(item, parent, visit)
    return
  }
  if (isNode(value)) visit(value, parent)
}

function eachChild(node, visit) {
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'parent') visitEntry(value, node, visit)
  }
}

function visitWithAncestors(node, ancestors, visit) {
  visit(node, ancestors)
  const nested = [...ancestors, node]
  eachChild(node, (child) => visitWithAncestors(child, nested, visit))
}

function parentOf(ancestors) {
  return ancestors.at(-1)
}

function grandparentOf(ancestors) {
  return ancestors.at(-2)
}

function isArrayPatternPair(id) {
  return isNode(id) && id.type === 'ArrayPattern' && id.elements.length === 2 && id.elements.every(isIdentifier)
}

function isCreateSignalCall(init) {
  return (
    isNode(init) && init.type === 'CallExpression' && isIdentifier(init.callee) && init.callee.name === CREATE_SIGNAL
  )
}

function collectSignalDeclarators(program) {
  const declarators = []
  visitWithAncestors(program, [], (node) => {
    if (node.type !== 'VariableDeclarator') return
    if (!isArrayPatternPair(node.id)) return
    if (!isCreateSignalCall(node.init)) return
    const [getter, setter] = node.id.elements
    declarators.push({node, getter, setter, getterName: getter.name, setterName: setter.name})
  })
  return declarators
}

function collectFunctionAncestors(program) {
  const map = new Map()
  visitWithAncestors(program, [], (node, ancestors) => {
    if (FUNCTION_TYPES.has(node.type)) map.set(node, ancestors)
  })
  return map
}

function jsxAttributeName(attribute) {
  if (!isNode(attribute) || attribute.type !== 'JSXAttribute') return undefined
  return attribute.name?.name
}

function isAttributeExpressionValue(node, ancestors) {
  const container = parentOf(ancestors)
  if (!isNode(container) || container.type !== 'JSXExpressionContainer') return false
  return container.expression === node
}

function isRefAttributeValue(node, ancestors) {
  if (!isAttributeExpressionValue(node, ancestors)) return false
  return jsxAttributeName(grandparentOf(ancestors)) === REF_ATTRIBUTE
}

function isHandlerAttributeValue(node, ancestors) {
  if (!isAttributeExpressionValue(node, ancestors)) return false
  const name = jsxAttributeName(grandparentOf(ancestors))
  return typeof name === 'string' && HANDLER_ATTRIBUTE.test(name)
}

function isCallCallee(node, ancestors) {
  const parent = parentOf(ancestors)
  return isNode(parent) && parent.type === 'CallExpression' && parent.callee === node
}

function nearestFunction(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    if (FUNCTION_TYPES.has(ancestors[index].type)) return ancestors[index]
  }
  return undefined
}

function isTargetIdentifier(node, name, excluded) {
  return isIdentifier(node) && node.name === name && !excluded.has(node)
}

function setterOnlyUsedAsRef(setterName, excluded, program) {
  let sawUsage = false
  let allRef = true
  visitWithAncestors(program, [], (node, ancestors) => {
    if (!isTargetIdentifier(node, setterName, excluded)) return
    sawUsage = true
    if (!isRefAttributeValue(node, ancestors)) allRef = false
  })
  return sawUsage && allRef
}

function analyzeGetterUsage(getterName, excluded, program) {
  const calls = []
  let bareUsage = false
  visitWithAncestors(program, [], (node, ancestors) => {
    if (!isTargetIdentifier(node, getterName, excluded)) return
    if (isCallCallee(node, ancestors)) {
      calls.push(nearestFunction(ancestors))
      return
    }
    bareUsage = true
  })
  return {calls, bareUsage}
}

function isVariableDeclaratorInit(node, ancestors) {
  const parent = parentOf(ancestors)
  return isNode(parent) && parent.type === 'VariableDeclarator' && parent.init === node
}

function declaredFunctionDeclarationName(fn) {
  if (fn.type !== 'FunctionDeclaration') return undefined
  return isIdentifier(fn.id) ? fn.id : undefined
}

function declaredVariableName(fn, ancestors) {
  if (!isVariableDeclaratorInit(fn, ancestors)) return undefined
  const declarator = parentOf(ancestors)
  return isIdentifier(declarator.id) ? declarator.id : undefined
}

function declaredFunctionNameNode(fn, ancestors) {
  return declaredFunctionDeclarationName(fn) ?? declaredVariableName(fn, ancestors)
}

function isReferenceToName(node, nameNode) {
  return isIdentifier(node) && node !== nameNode && node.name === nameNode.name
}

function isNameOnlyReferencedAsHandler(nameNode, program) {
  let sawReference = false
  let allHandlers = true
  visitWithAncestors(program, [], (node, ancestors) => {
    if (!isReferenceToName(node, nameNode)) return
    sawReference = true
    if (!isHandlerAttributeValue(node, ancestors)) allHandlers = false
  })
  return sawReference && allHandlers
}

function functionIsHandlerOnly(fn, ancestors, program) {
  if (isHandlerAttributeValue(fn, ancestors)) return true
  const nameNode = declaredFunctionNameNode(fn, ancestors)
  if (nameNode === undefined) return false
  return isNameOnlyReferencedAsHandler(nameNode, program)
}

function everyCallHasEnclosingFunction(calls) {
  return calls.every((fn) => fn !== undefined)
}

function everyFunctionIsHandlerOnly(functions, functionAncestors, program) {
  for (const fn of functions) {
    const ancestors = functionAncestors.get(fn) ?? []
    if (!functionIsHandlerOnly(fn, ancestors, program)) return false
  }
  return true
}

function getterOnlyCalledFromHandlers(getterName, excluded, program, functionAncestors) {
  const {calls, bareUsage} = analyzeGetterUsage(getterName, excluded, program)
  if (bareUsage) return false
  if (calls.length === 0) return true
  if (!everyCallHasEnclosingFunction(calls)) return false
  return everyFunctionIsHandlerOnly(new Set(calls), functionAncestors, program)
}

function reportSignalRef(declaration, context) {
  context.report({
    node: declaration.node,
    messageId: 'signalOnlyForRef',
    data: {getter: declaration.getterName, setter: declaration.setterName},
  })
}

function isEligibleSignalDeclaration(declaration, program, functionAncestors) {
  const excluded = new Set([declaration.getter, declaration.setter])
  if (!setterOnlyUsedAsRef(declaration.setterName, excluded, program)) return false
  return getterOnlyCalledFromHandlers(declaration.getterName, excluded, program, functionAncestors)
}

function checkSignalRefs(program, context) {
  const declarations = collectSignalDeclarators(program)
  if (declarations.length === 0) return
  const functionAncestors = collectFunctionAncestors(program)
  for (const declaration of declarations) {
    if (isEligibleSignalDeclaration(declaration, program, functionAncestors)) reportSignalRef(declaration, context)
  }
}

export default {
  meta: {
    type: 'problem',
    messages: {
      signalOnlyForRef:
        "'{{setter}}' is only ever used as `ref={{{setter}}}`, and '{{getter}}' is never read from a reactive scope: nothing tracks this signal. Per https://docs.solidjs.com/concepts/refs, use a plain `let {{getter}}: HTMLDivElement | undefined` with `ref={{{getter}}}` instead of `createSignal`; wrap it in `() => {{getter}}` at the call site if an accessor is needed.",
    },
    schema: [],
  },
  createOnce(context) {
    return {
      Program(program) {
        checkSignalRefs(program, context)
      },
    }
  },
}
