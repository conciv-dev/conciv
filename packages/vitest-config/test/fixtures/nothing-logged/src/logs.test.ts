import {test} from 'vitest'
import {declareExpectedLog} from '../../../../src/expected-log.ts'

test('logs an error it did not declare', () => {
  console.error('the draft could not be saved')
})

test('logs an error it declared', ({task}) => {
  declareExpectedLog(task, /draft could not/)
  console.error('the draft could not be saved')
})

test('logs a warning it did not declare', () => {
  console.warn('the socket closed early')
})

test('logs nothing', () => {})
