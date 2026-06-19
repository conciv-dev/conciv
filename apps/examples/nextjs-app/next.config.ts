import type {NextConfig} from 'next'
import {withMandarax} from '@mandarax/qu/plugin/nextjs'

const nextConfig: NextConfig = {}

export default withMandarax(nextConfig)
