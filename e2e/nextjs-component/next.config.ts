import type {NextConfig} from 'next'
import {withConciv} from '@conciv/it/plugin/nextjs'

const nextConfig: NextConfig = {experimental: {agentUpgrade: false}}
const enginePort = process.env.CONCIV_E2E_ENGINE_PORT

export default withConciv(nextConfig, {port: enginePort === undefined ? undefined : Number(enginePort)})
