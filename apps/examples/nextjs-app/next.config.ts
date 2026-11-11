import type {NextConfig} from 'next'
import {withConciv} from '@conciv/it/plugin/nextjs'
import tanstack from '@conciv/extension-tanstack'
import terminal from '@conciv/extension-terminal'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'

const nextConfig: NextConfig = {}

export default withConciv(nextConfig, {extensions: [tanstack(), terminal(), testRunner(), whiteboard()]})
