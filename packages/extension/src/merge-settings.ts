import {createDefu} from 'defu'

const projectOverGlobal = createDefu((object: Record<PropertyKey, unknown>, key, value) => {
  if (!Array.isArray(value)) return false
  object[key] = value
  return true
})

export function mergeSettings(
  project: Record<string, unknown>,
  global: Record<string, unknown>,
): Record<string, unknown> {
  return projectOverGlobal(project, global)
}
