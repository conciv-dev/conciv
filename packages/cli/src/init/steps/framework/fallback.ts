import type {Detected} from '../../detect.js'
import type {InitStep, ManualCard} from '../../pipeline.js'

const viteSnippet = `import conciv from '@conciv/it/plugin/vite'
export default defineConfig({plugins: [conciv()]})`

function rollupCard(): ManualCard {
  return {
    title: 'Rollup is build-only today',
    body: `The @conciv/it/plugin/rollup entry exists but is a build-only no-op today. It does not boot the engine or inject the widget yet.
Use Vite for the full experience. Vite uses Rollup under the hood, so most Rollup apps can adopt the Vite plugin directly.
Full steps: https://conciv.dev/docs/quick-start/rollup`,
  }
}

function esbuildCard(): ManualCard {
  return {
    title: 'esbuild is build-only today',
    body: `The @conciv/it/plugin/esbuild entry exists but is a build-only no-op today. It does not boot the engine or inject the widget yet.
Use Vite for the full experience.
Full steps: https://conciv.dev/docs/quick-start/esbuild`,
  }
}

function unknownCard(): ManualCard {
  return {
    title: 'Wire conciv with Vite',
    body: `conciv could not detect a supported bundler. The full conciv experience needs one of the supported bundlers; Vite is the recommended path.
Full steps: https://conciv.dev/docs/quick-start/vite`,
    snippet: viteSnippet,
  }
}

function cardFor(detected: Detected): ManualCard {
  if (detected.framework === 'rollup') return rollupCard()
  if (detected.framework === 'esbuild') return esbuildCard()
  return unknownCard()
}

export function fallbackStep(detected: Detected): InitStep {
  return {
    id: 'framework',
    title: 'Framework wiring',
    detect: async () => 'missing',
    plan: async () => ({summary: `print the manual wiring card for ${detected.framework}`, wouldEdit: []}),
    apply: async () => ({status: 'manual', cards: [cardFor(detected)]}),
    verify: async () => false,
    manualCard: () => cardFor(detected),
  }
}
