export default {
  id: 'stamper',
  setup() {},
  bundler: {
    transform(code, id) {
      if (!id.endsWith('/src/app.jsx')) return null
      return `${code}\nexport const stamperSawSource = ${code.includes('data-tsd-source')}\n`
    },
    resolveId(id) {
      return id === 'virtual:stamper' ? '\0virtual:stamper' : null
    },
    load(id) {
      return id === '\0virtual:stamper' ? "export const virtualGreeting = 'from the stamper'\n" : null
    },
  },
}
