import type {NextConfig} from 'next'
import {withConciv} from '@conciv/it/plugin/nextjs'
import terminal from '@conciv/extension-terminal'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'

const nextConfig: NextConfig = {}

export default withConciv(nextConfig, {extensions: [terminal(), testRunner(), whiteboard()]})
