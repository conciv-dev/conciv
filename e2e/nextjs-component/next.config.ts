import type {NextConfig} from 'next'
import {withConciv} from '@conciv/it/plugin/nextjs'

const nextConfig: NextConfig = {experimental: {agentUpgrade: false}}

export default withConciv(nextConfig)
