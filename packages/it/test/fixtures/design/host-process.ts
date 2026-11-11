import {z} from 'zod'
import {serveDesignHost} from './host-server.js'

const HostOptionsSchema = z.object({
  stateRoot: z.string(),
  homeDir: z.string(),
  devEndpointDir: z.string(),
})

const options = HostOptionsSchema.parse(JSON.parse(process.argv[2] ?? '{}'))
const served = await serveDesignHost({...options, print: (line) => process.send?.({line})})
process.send?.({origin: served.origin})
