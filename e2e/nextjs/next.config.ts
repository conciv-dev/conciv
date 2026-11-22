import type {NextConfig} from 'next'
import {pathToFileURL} from 'node:url'
import {withConciv} from '@conciv/it/plugin/nextjs'
import {e2ePluginCopyDir} from '@conciv/e2e-utils/dev-endpoint'

const nextConfig: NextConfig = {experimental: {agentUpgrade: false}}
const enginePort = process.env.CONCIV_E2E_ENGINE_PORT

export default withConciv(nextConfig, {
  plugins: [pathToFileURL(e2ePluginCopyDir(import.meta.dirname, 'live-line')).href],
  port: enginePort === undefined ? undefined : Number(enginePort),
})
