import * as Tool from '@conciv/protocol/schema/tool'

export const makeToolFailure = (fields: Parameters<typeof Tool.makeError>[0]): Tool.Error =>
  Object.assign(Tool.makeError(fields), {name: 'ToolFailure'})
