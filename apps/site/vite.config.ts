import react from '@vitejs/plugin-react'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import {cloudflare} from '@cloudflare/vite-plugin'
import {defineConfig, type Plugin} from 'vite'
import tailwindcss from '@tailwindcss/vite'
import mdx from 'fumadocs-mdx/vite'
import conciv from '@conciv/it/plugin/vite'
import {concivTest} from '@internal/vitest-config/conciv-test'
import {sourceAnnotations} from './src/lib/source-annotations.ts'
import {brandAssetsAlias} from './brand-assets-alias.ts'

const ONNX_RUNTIME_WASM_PREFIX = 'assets/ort-'

function dropOnnxRuntimeWasmFromServerBundle(): Plugin {
  return {
    name: 'drop-onnx-runtime-wasm-from-server-bundle',
    generateBundle(_options, bundle) {
      if (this.environment.name !== 'ssr') return
      Object.keys(bundle)
        .filter((fileName) => fileName.endsWith('.wasm') && fileName.startsWith(ONNX_RUNTIME_WASM_PREFIX))
        .forEach((fileName) => delete bundle[fileName])
    },
  }
}

export default defineConfig(({mode}) => ({
  server: {
    port: 3001,
  },
  preview: {
    host: '127.0.0.1',
  },
  plugins: [
    sourceAnnotations(import.meta.dirname),
    dropOnnxRuntimeWasmFromServerBundle(),
    mode !== 'test' && cloudflare({viteEnvironment: {name: 'ssr'}}),
    mdx(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        filter: ({path}) => !path.startsWith('/assets/'),
      },
    }),
    react(),
    conciv({widget: false}),
    concivTest(),
  ],
  ssr: {
    noExternal: ['gsap', '@gsap/react'],
  },
  environments: {
    ssr: {
      build: {
        minify: true,
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: 'tslib/tslib.es6.js',
      ...brandAssetsAlias,
    },
  },
}))
