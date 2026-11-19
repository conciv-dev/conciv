import type {NextConfig} from 'next'
import {withConciv} from '@conciv/it/plugin/nextjs'
import tanstack from '@conciv/extension-tanstack'

const nextConfig: NextConfig = {}

export default withConciv(nextConfig, {
  extensions: [tanstack()],
  plugins: ['./node_modules/@conciv/plugin-test-runner', './node_modules/@conciv/plugin-whiteboard'],
})
