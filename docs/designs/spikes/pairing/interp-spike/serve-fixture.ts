import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
const [root, port, cacheDir] = process.argv.slice(2)
const server = await createServer({
  configFile: false,
  root,
  cacheDir,
  plugins: [react()],
  server: {port: Number(port), strictPort: true, fs: {allow: ['/Users/omrikatz/Public/web/aidx-loop']}},
  logLevel: 'warn',
})
await server.listen()
console.log('serving', root, port)
