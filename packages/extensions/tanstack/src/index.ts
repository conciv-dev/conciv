import {defineExtension, definePageVerbs} from '@conciv/extension'

export const tanstack = defineExtension({name: 'tanstack'}).client(() => ({
  value: {},
  pageVerbs: definePageVerbs({}),
}))

export default tanstack
