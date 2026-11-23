import type {NextConfig} from 'next'
import {pathToFileURL} from 'node:url'
import {withConciv} from '@conciv/it/plugin/nextjs'
import {e2ePluginCopyDir} from '@conciv/e2e-utils/state-dir'

const nextConfig: NextConfig = {experimental: {agentUpgrade: false}}

export default withConciv(nextConfig, {
  plugins: [pathToFileURL(e2ePluginCopyDir(import.meta.dirname, 'live-line')).href],
})
