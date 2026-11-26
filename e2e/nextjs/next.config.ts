import type {NextConfig} from 'next'
import {pathToFileURL} from 'node:url'
import {withConciv} from '@conciv/it/plugin/nextjs'
import {e2ePluginCopyDir} from '@internal/e2e-utils/dev-endpoint'

const nextConfig: NextConfig = {experimental: {agentUpgrade: false}}

export default withConciv(nextConfig, {
  plugins: [pathToFileURL(e2ePluginCopyDir(import.meta.dirname, 'live-line')).href],
})
