import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/connect-handshake.ts',
    'src/core-kit.ts',
    'src/host/grab.ts',
    'src/widget-suite.ts',
    'src/listen-local.ts',
    'src/navigation-state.ts',
    'src/node.ts',
    'src/flow.ts',
    'src/rpc-counts.ts',
    'src/rpc-wire.ts',
    'src/chat-wire.ts',
    'src/rpc-fault.ts',
    'src/rpc-socket.ts',
    'src/rpc-observer.ts',
    'src/chat-fault.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
