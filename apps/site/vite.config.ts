import react from '@vitejs/plugin-react'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import {cloudflare} from '@cloudflare/vite-plugin'
import {defineConfig, type Plugin, type Rollup} from 'vite'
import tailwindcss from '@tailwindcss/vite'
import mdx from 'fumadocs-mdx/vite'
import conciv from '@conciv/it/plugin/vite'
import {sourceAnnotations} from './src/lib/source-annotations'

const CLIENT_ONLY_MODULE = [
  /[\\/]solid-js[\\/]/,
  /[\\/]@huggingface[\\/]transformers[\\/]/,
  /[\\/]onnxruntime[^\\/]*[\\/]/,
  /[\\/]mermaid[\\/]/,
  /[\\/]@mermaid-js[\\/]/,
  /[\\/]cytoscape[^\\/]*[\\/]/,
  /[\\/]katex[\\/]/,
  /[\\/]@shikijs[\\/]langs[\\/]/,
]

function isClientOnlyChunk(output: Rollup.OutputAsset | Rollup.OutputChunk): boolean {
  if (output.type !== 'chunk') return false
  return Object.keys(output.modules).some((id) => CLIENT_ONLY_MODULE.some((re) => re.test(id)))
}

function isServerDroppable(fileName: string, output: Rollup.OutputAsset | Rollup.OutputChunk): boolean {
  return fileName.endsWith('.wasm') || isClientOnlyChunk(output)
}

function trimServerBundle(): Plugin {
  return {
    name: 'trim-server-bundle',
    generateBundle(_options, bundle) {
      if (this.environment.name !== 'ssr') return
      for (const [fileName, output] of Object.entries(bundle)) {
        if (isServerDroppable(fileName, output)) delete bundle[fileName]
      }
    },
  }
}

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [
    sourceAnnotations(import.meta.dirname),
    trimServerBundle(),
    cloudflare({viteEnvironment: {name: 'ssr'}}),
    mdx(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
      },
    }),
    react(),
    conciv({widget: {quickTerminal: {hotkey: ['Alt+k']}}}),
  ],
  ssr: {
    noExternal: ['gsap', '@gsap/react'],
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: 'tslib/tslib.es6.js',
    },
  },
})
