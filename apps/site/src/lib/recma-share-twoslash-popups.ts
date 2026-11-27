type EstreeNode = Record<string, unknown>

const POSITION_KEYS = ['start', 'end', 'loc', 'range', 'position']
const POPUP_COMPONENT = 'PopupContent'
const CONTENT_FUNCTION = '_createMdxContent'

function isNode(value: unknown): value is EstreeNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, 'type') === 'string'
  )
}

function isPopupContent(node: EstreeNode) {
  if (node.type !== 'CallExpression' || !Array.isArray(node.arguments)) return false
  const component: unknown = node.arguments[0]
  return isNode(component) && component.type === 'Identifier' && component.name === POPUP_COMPONENT
}

function popupKey(node: EstreeNode) {
  return JSON.stringify(node, (key, value: unknown) => (POSITION_KEYS.includes(key) ? undefined : value))
}

type OnPopup = (popup: EstreeNode) => EstreeNode | undefined

function visitChild(child: unknown, onPopup: OnPopup): EstreeNode | undefined {
  if (!isNode(child)) return undefined
  if (isPopupContent(child)) return onPopup(child)
  visitPopups(child, onPopup)
  return undefined
}

function visitPopups(node: EstreeNode, onPopup: OnPopup) {
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      value.forEach((item: unknown, index) => {
        const replacement = visitChild(item, onPopup)
        if (replacement !== undefined) value[index] = replacement
      })
      continue
    }
    const replacement = visitChild(value, onPopup)
    if (replacement !== undefined) node[key] = replacement
  }
}

function findContentFunction(tree: unknown) {
  if (!isNode(tree) || !Array.isArray(tree.body)) return undefined
  return tree.body.find(
    (statement): statement is EstreeNode =>
      isNode(statement) &&
      statement.type === 'FunctionDeclaration' &&
      isNode(statement.id) &&
      statement.id.name === CONTENT_FUNCTION,
  )
}

function shareDuplicatePopups(tree: unknown) {
  const contentFunction = findContentFunction(tree)
  const body = contentFunction?.body
  if (!isNode(body) || !Array.isArray(body.body)) return
  const statements: unknown[] = body.body

  const counts = new Map<string, number>()
  visitPopups(body, (popup) => {
    const key = popupKey(popup)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    return undefined
  })

  const shared = new Map<string, {name: string; init: EstreeNode}>()
  visitPopups(body, (popup) => {
    const key = popupKey(popup)
    if ((counts.get(key) ?? 0) < 2) return popup
    const existing = shared.get(key) ?? {name: `_twoslashPopup${shared.size}`, init: popup}
    shared.set(key, existing)
    return {type: 'Identifier', name: existing.name}
  })
  if (shared.size === 0) return

  const declaration = {
    type: 'VariableDeclaration',
    kind: 'const',
    declarations: [...shared.values()].map(({name, init}) => ({
      type: 'VariableDeclarator',
      id: {type: 'Identifier', name},
      init,
    })),
  }
  const returnIndex = statements.findLastIndex((statement) => isNode(statement) && statement.type === 'ReturnStatement')
  statements.splice(returnIndex < 0 ? statements.length : returnIndex, 0, declaration)
}

export function recmaShareTwoslashPopups() {
  return shareDuplicatePopups
}
