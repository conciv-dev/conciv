import {STATUS_CODES} from 'node:http'
import {toolError, type ToolError} from '@conciv/extension'
import {z} from 'zod'

export async function figmaRefused(input: {
  response: Response
  link: {fileKey: string; nodeId: string}
}): Promise<ToolError> {
  const {response, link} = input
  const reason = STATUS_CODES[response.status]
  const said = FigmaErrorSchema.safeParse(await response.json().catch(() => null)).data?.err ?? reason ?? ''
  if (reason === UNAUTHORIZED || said.toLowerCase().includes(TOKEN))
    return toolError('figma-token', {message: `Figma refused the token: ${said}`, data: {hint: TOKEN_HINT}})
  if (reason === FORBIDDEN) return toolError('figma-request', {message: `Figma refused access to file ${link.fileKey}`})
  return toolError('figma-request', {message: `Figma answered ${response.status} for ${link.nodeId}`})
}

const FigmaErrorSchema = z.object({err: z.string()})
const UNAUTHORIZED = 'Unauthorized'
const FORBIDDEN = 'Forbidden'
const TOKEN = 'token'
const TOKEN_HINT =
  'set FIGMA_API_KEY in the environment of the dev server to a fresh Figma personal access token, then restart the dev server'
