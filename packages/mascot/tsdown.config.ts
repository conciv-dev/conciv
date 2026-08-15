import {defineConfig} from 'tsdown'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  entry: [
    'src/rig.ts',
    'src/core/index.ts',
    'src/solid/index.ts',
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
  format: 'esm',
  fixedExtension: false,
  unbundle: true,
  dts: true,
  plugins: [solidPlugin()],
  external: ['solid-js', /^solid-js\//],
})
