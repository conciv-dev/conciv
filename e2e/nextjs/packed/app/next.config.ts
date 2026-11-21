import {withConciv} from '@conciv/it/plugin/nextjs'

export default withConciv(
  {},
  {port: Number(process.env.CONCIV_E2E_ENGINE_PORT), devEndpointDir: process.env.CONCIV_E2E_DEV_ENDPOINT_DIR},
)
