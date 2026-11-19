import {Store} from '@conciv/plugin/experimental'
import {z} from 'zod'

export const whiteboardStores = {account: Store.global(z.object({id: z.string().nullable()}), {id: null})}
