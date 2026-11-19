import type {NextConfig} from 'next'
import {withConciv} from '@conciv/it/plugin/nextjs'

const nextConfig: NextConfig = {}

export default withConciv(nextConfig, {
  plugins: ['./node_modules/@conciv/plugin-test-runner', './node_modules/@conciv/plugin-tanstack'],
})
