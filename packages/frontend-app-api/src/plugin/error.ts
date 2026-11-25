export function pluginError(code: 'notFound' | 'builtin') {
  return Object.assign(new Error(code), {code})
}
