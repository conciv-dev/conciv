import type {NextConfig} from 'next'
import {withConciv} from '@conciv/it/plugin/nextjs'
import whiteboard from '@conciv/extension-whiteboard'

const nextConfig: NextConfig = {}

export default withConciv(nextConfig, {
  extensions: [whiteboard()],
  plugins: ['./node_modules/@conciv/plugin-test-runner', './node_modules/@conciv/plugin-tanstack'],
})
