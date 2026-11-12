import type {NextConfig} from 'next'
import {withSentry} from '@sentry/nextjs'

const nextConfig: NextConfig = {
  reactStrictMode: true,
}

export default withSentry(nextConfig)
