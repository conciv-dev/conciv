import {defineExtension} from '@conciv/extension'
import {PAGE_EXTENSION_NAME} from './shared/defs.js'

export const page = defineExtension({name: PAGE_EXTENSION_NAME}).client(() => ({value: {}}))

export default page

export {endRun, endTask, mountSimulator} from './client/simulator.js'
