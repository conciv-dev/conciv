import {describe, expect, it} from 'vitest'
import {formatLoggedError} from '../../src/ai/logged-error.js'

describe('a TanStack AI error line in the engine log', () => {
  it.each([
    {
      message: 'code-mode execute_typescript failed',
      error: {name: 'ReferenceError', message: "'external_weather_forecast' is not defined", stack: 'at <eval>'},
      line: "[ai] code-mode execute_typescript failed: ReferenceError: 'external_weather_forecast' is not defined",
    },
    {
      message: 'WebSocket errored; aborting its turns',
      error: undefined,
      line: '[ai] WebSocket errored; aborting its turns',
    },
    {
      message: 'WS turn failed',
      error: new Error('the socket closed'),
      line: '[ai] WS turn failed: Error: the socket closed',
    },
  ])('names the failure of "$message"', ({message, error, line}) => {
    expect(formatLoggedError(message, error)).toBe(line)
  })
})
