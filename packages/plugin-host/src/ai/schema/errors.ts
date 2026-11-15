import {Tool} from '../../schema/tool.js'

export const makeToolFailure = (fields: Parameters<typeof Tool.makeError>[0]): Tool.Error =>
  Object.assign(Tool.makeError(fields), {name: 'ToolFailure'})
