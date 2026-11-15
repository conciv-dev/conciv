export function panelKey(plugin: string, id: string) {
  return `${plugin}:${id}`
}

export function isPluginView(view: string, extensionViews: readonly {readonly id: string}[]) {
  return isPanelKey(view) && !extensionViews.some((candidate) => candidate.id === view)
}

function isPanelKey(key: string) {
  const at = key.indexOf(':')

  return at > 0 && at < key.length - 1
}
