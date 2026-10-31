const DOCUMENT_FRAGMENT_NODE = 11

export function isShadowRoot(node: Node | undefined): node is ShadowRoot {
  return node !== undefined && node.nodeType === DOCUMENT_FRAGMENT_NODE && 'host' in node
}
