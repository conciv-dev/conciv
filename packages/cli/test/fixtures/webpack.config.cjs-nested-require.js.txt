function loadPlugin() {
  const conciv = require('@conciv/it/plugin/webpack')
  return conciv
}

module.exports = {
  entry: './src/index.js',
  plugins: [conciv.default()],
  loader: loadPlugin,
}
