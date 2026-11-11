import type {NextConfig} from 'next'
import {withConciv} from '@conciv/it/plugin/nextjs'
import terminal from '@conciv/extension-terminal'

const nextConfig: NextConfig = {}

export default withConciv(nextConfig, {extensions: [terminal()]})
