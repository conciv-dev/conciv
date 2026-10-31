const ELEMENT_NODE = 1
const DOCUMENT_NODE = 9
const DOCUMENT_FRAGMENT_NODE = 11

export function isShadowRoot(node: Node | null | undefined): node is ShadowRoot {
  return node !== undefined && node !== null && node.nodeType === DOCUMENT_FRAGMENT_NODE && 'host' in node
}

export function isDocument(node: Node | null | undefined): node is Document {
  return node !== undefined && node !== null && node.nodeType === DOCUMENT_NODE
}

export function isHTMLElement(node: Node | null | undefined): node is HTMLElement {
  return node !== undefined && node !== null && node.nodeType === ELEMENT_NODE && 'style' in node
}

export function viewOf(node: Node | null | undefined): Window {
  if (isDocument(node)) return node.defaultView ?? window
  return node?.ownerDocument?.defaultView ?? window
}

export function activeElementIn(root: Node): Element | null {
  if (isDocument(root) || isShadowRoot(root)) return root.activeElement
  return null
}
