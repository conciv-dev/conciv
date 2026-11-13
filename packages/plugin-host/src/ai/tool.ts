import {JsonSchema, Schema} from 'effect'
import {makeToolFailure} from './schema/index.js'
import {isRecord} from './utils/record.js'

export const emptyInputJsonSchema = (schema: Schema.Top): JsonSchema.JsonSchema | undefined => {
  const {not, ...rest} = Schema.toJsonSchemaDocument(schema, {referencePolicy: () => undefined}).schema
  if (!isRecord(not) || not.type !== 'null' || Object.keys(not).length !== 1) return undefined
  if (!Object.keys(rest).every((key) => annotationKeywords.has(key))) return undefined
  return {...rest, type: 'object', properties: {}, additionalProperties: false}
}

const annotationKeywords = new Set(['title', 'description', 'default', 'examples', 'readOnly', 'writeOnly'])

export {makeToolFailure}
