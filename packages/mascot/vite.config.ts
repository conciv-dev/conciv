import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [{...solid(), applyToEnvironment: (environment) => environment.name !== 'source'}, concivTest()],
    environments: {
      server: {
        entries: [
          'src/core/core.ts',
          'src/core/style-merge.ts',
          'src/core/adapter.ts',
          'src/solid/solid.ts',
          'src/core/effects/binary.ts',
          'src/core/effects/matrix.ts',
          'src/core/effects/thought-cloud.ts',
          'src/core/effects/pixel-bubbles.ts',
          'src/core/effects/signal-rings.ts',
          'src/core/effects/speech-bubble.ts',
          'src/core/effects/steam.ts',
          'src/core/effects/spark.ts',
          'src/core/effects/spark-burst.ts',
          'src/core/effects/spark-fountain.ts',
          'src/core/effects/satellite.ts',
          'src/core/effects/led-cone.ts',
          'src/core/effects/tick-ring.ts',
          'src/core/effects/signal-bars.ts',
          'src/core/effects/heart.ts',
          'src/core/effects/notes.ts',
        ],
        unbundle: true,
        external: ['solid-js', /^solid-js\//],
      },
      source: {
        entries: ['src/solid/solid.ts'],
        outDir: 'dist/solid',
        jsx: 'preserve',
        unbundle: true,
        external: ['solid-js', /^solid-js\//, /^\.\.\//],
      },
    },
  }),
)
