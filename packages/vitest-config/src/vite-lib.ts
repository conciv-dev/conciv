import {fileURLToPath} from 'node:url'
import type {UserConfig} from 'vite'
import solid from 'vite-plugin-solid'

export type SolidLibBuild = {entry: URL; external: ReadonlyArray<string | RegExp>}

export function solidLibConfig(build: SolidLibBuild): UserConfig {
  return {
    plugins: [solid()],
    build: {
      lib: {
        entry: fileURLToPath(build.entry),
        formats: ['es'],
        fileName: () => 'index.js',
      },
      rollupOptions: {external: [...build.external]},
      emptyOutDir: true,
      sourcemap: true,
    },
  }
}
