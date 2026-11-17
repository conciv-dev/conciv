import type {NextConfig} from 'next'
import {withConciv} from '@conciv/it/plugin/nextjs'
import tanstack from '@conciv/extension-tanstack'
import terminal from '@conciv/extension-terminal'
import whiteboard from '@conciv/extension-whiteboard'

const nextConfig: NextConfig = {}

export default withConciv(nextConfig, {
  extensions: [tanstack(), terminal(), whiteboard()],
  plugins: ['./node_modules/@conciv/plugin-test-runner'],
})
