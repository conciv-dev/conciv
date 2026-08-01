const WEB_FIRST_REPLACEMENTS = new Map([
  ['textContent', 'toHaveText'],
  ['innerText', 'toHaveText'],
  ['isVisible', 'toBeVisible'],
  ['isHidden', 'toBeHidden'],
  ['isChecked', 'toBeChecked'],
  ['isEnabled', 'toBeEnabled'],
  ['isDisabled', 'toBeDisabled'],
  ['isEditable', 'toBeEditable'],
  ['count', 'toHaveCount'],
  ['getAttribute', 'toHaveAttribute'],
  ['inputValue', 'toHaveValue'],
])

function isIdentifier(node, name) {
  return node?.type === 'Identifier' && node.name === name
}

function isStaticMember(node) {
  return node?.type === 'MemberExpression' && node.computed !== true
}

function isAstNode(value) {
  return typeof value?.type === 'string'
}

function isExpectPoll(node) {
  const callee = node.callee
  if (!isStaticMember(callee)) return false
  if (!isIdentifier(callee.object, 'expect')) return false
  return isIdentifier(callee.property, 'poll')
}

function memberPropertyName(callee) {
  if (!isStaticMember(callee)) return undefined
  return callee.property?.name
}

function replacementFor(node) {
  if (node.type !== 'CallExpression') return undefined
  const method = memberPropertyName(node.callee)
  const replacement = WEB_FIRST_REPLACEMENTS.get(method)
  if (!replacement) return undefined
  return {method, replacement}
}

function searchList(items) {
  for (const item of items) {
    const found = locatorMethodCall(item)
    if (found) return found
  }
  return undefined
}

function searchChildren(node) {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue
    const found = locatorMethodCall(value)
    if (found) return found
  }
  return undefined
}

function searchNode(node) {
  return replacementFor(node) ?? searchChildren(node)
}

function locatorMethodCall(value) {
  if (Array.isArray(value)) return searchList(value)
  if (!isAstNode(value)) return undefined
  return searchNode(value)
}

export default {
  meta: {
    type: 'problem',
    messages: {
      noLocatorPoll:
        "expect.poll over locator.{{method}}() takes a one-shot snapshot per tick. Use await expect(locator).{{replacement}}(...) from 'playwright/test', which auto-retries on the live locator.",
    },
    schema: [],
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isExpectPoll(node)) return
        const found = locatorMethodCall(node.arguments?.[0])
        if (!found) return
        context.report({node, messageId: 'noLocatorPoll', data: found})
      },
    }
  },
}
