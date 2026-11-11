const TWOSLASH_LINE = /^\/\/\s*(@noErrors|\^[?|])/

export const cleanSnippet = (code: string) =>
  code
    .split('\n')
    .filter((line) => !TWOSLASH_LINE.test(line.trim()))
    .join('\n')

export type FrameworkSnippet = {
  id: string
  label: string
  icon: string
  href: string
  file?: string
  lang?: 'ts' | 'js' | 'swift'
  twoslash?: boolean
  code?: string
  note?: string
  soon?: boolean
  alpha?: boolean
}

export const FRAMEWORK_SNIPPETS: FrameworkSnippet[] = [
  {
    id: 'vite',
    label: 'Vite',
    icon: '/icons/vite.svg',
    href: '/docs/quick-start/vite',
    file: 'vite.config.ts',
    lang: 'ts',
    twoslash: true,
    code: `// @noErrors
import {defineConfig} from 'vite'
import conciv, {type ConcivConfig} from '@conciv/it/plugin/vite'

const options: ConcivConfig = {
  h
// ^|
}

export default defineConfig({
  plugins: [conciv(options)],
})`,
  },
  {
    id: 'nextjs',
    label: 'Next.js',
    icon: '/icons/nextjs.svg',
    href: '/docs/quick-start/nextjs',
    file: 'next.config.ts',
    lang: 'ts',
    note: '+ two instrumentation one-liners (see the guide)',
    code: `import type {NextConfig} from 'next'
import {withConciv} from '@conciv/it/plugin/nextjs'

const nextConfig: NextConfig = {}

export default withConciv(nextConfig)`,
  },
  {
    id: 'webpack',
    label: 'webpack',
    icon: '/icons/webpack.svg',
    href: '/docs/quick-start/webpack',
    file: 'webpack.config.js',
    lang: 'js',
    code: `const conciv = require('@conciv/it/plugin/webpack')

module.exports = {
  plugins: [conciv.default()],
}`,
  },
  {
    id: 'rspack',
    label: 'Rspack',
    icon: '/icons/rspack.svg',
    href: '/docs/quick-start/rspack',
    file: 'rspack.config.js',
    lang: 'js',
    code: `const conciv = require('@conciv/it/plugin/rspack')

module.exports = {
  plugins: [conciv.default()],
}`,
  },
  {
    id: 'ios',
    label: 'iOS',
    icon: '/icons/apple.svg',
    href: '/docs/quick-start/ios',
    file: 'Package.swift',
    lang: 'swift',
    alpha: true,
    note: 'The .package line goes in dependencies, the .product line in your target. Simulator only for now.',
    code: `.package(url: "https://github.com/conciv-dev/conciv-swift.git", from: "0.0.1"),
.product(name: "ConcivWidget", package: "conciv-swift"),`,
  },
  {id: 'rollup', label: 'Rollup', icon: '/icons/rollup.svg', href: '/docs/quick-start/rollup', soon: true},
  {id: 'esbuild', label: 'esbuild', icon: '/icons/esbuild.svg', href: '/docs/quick-start/esbuild', soon: true},
]
