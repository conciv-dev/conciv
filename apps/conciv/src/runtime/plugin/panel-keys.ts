export function panelKey(plugin: string, id: string) {
  return `${plugin}:${id}`
}

export function isPluginView(key: string) {
  const at = key.indexOf(':')

  return at > 0 && at < key.length - 1
}
