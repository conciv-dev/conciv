import {describe, expect, test} from 'vitest'
import {composeGrabText, sourceLabel} from './grab-label.js'

describe('grab labels', () => {
  test.each([
    [{componentName: 'Composer', filePath: 'src/composer.tsx', lineNumber: 12}, 'Composer at src/composer.tsx:12'],
    [{componentName: null, filePath: 'src/composer.tsx', lineNumber: 12}, 'src/composer.tsx:12'],
    [{componentName: 'Composer', filePath: 'src/composer.tsx', lineNumber: null}, 'Composer at src/composer.tsx'],
    [{componentName: 'Composer', filePath: '', lineNumber: null}, 'Composer'],
    [{componentName: null, filePath: '', lineNumber: null}, ''],
  ])('the source %o is labelled %j', (source, label) => {
    expect(sourceLabel(source)).toBe(label)
  })

  test.each([
    [
      '<button>Send</button>',
      {file: 'src/composer.tsx', line: 12, column: 5},
      '<button>Send</button> at src/composer.tsx:12:5',
    ],
    ['<button>Send</button>', null, 'Send button'],
    ['', {file: 'src/composer.tsx', line: 12, column: 5}, 'Send button'],
  ])('the snippet %j with the source %o is told to the agent as %j', (snippet, source, text) => {
    expect(composeGrabText(snippet, source, 'Send button')).toBe(text)
  })
})
