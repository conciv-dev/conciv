import {withConciv} from '@conciv/it/plugin/nextjs'

export default withConciv({experimental: {agentUpgrade: false}}, {port: Number(process.env.CONCIV_E2E_ENGINE_PORT)})
