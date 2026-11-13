const banner = 'this bundle used to set module.exports directly'

export default {
  entry: './src/index.js',
  plugins: [{banner}],
}
