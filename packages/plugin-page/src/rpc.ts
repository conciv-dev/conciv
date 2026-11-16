import {Rpc} from '@conciv/plugin/rpc'
import {SourceLocSchema, SymbolicateSchema} from '@conciv/protocol/page-types'

export const Definition = Rpc.define({
  id: 'experimental.page',
  methods: {
    symbolicate: {input: SymbolicateSchema, output: SourceLocSchema.nullable()},
  },
  events: {},
})
