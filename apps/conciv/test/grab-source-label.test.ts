import {describe, expect, it} from 'vitest'
import {sourceLabel} from '../src/chat/grab-source-label.js'

describe('sourceLabel', () => {
  it('renders component and file:line for a web grab', () => {
    expect(sourceLabel({componentName: 'PaymentCardCell', filePath: 'src/card.tsx', lineNumber: 42})).toBe(
      'PaymentCardCell at src/card.tsx:42',
    )
  })

  it('omits the line when there is none', () => {
    expect(sourceLabel({componentName: 'PaymentCardCell', filePath: 'src/card.tsx', lineNumber: null})).toBe(
      'PaymentCardCell at src/card.tsx',
    )
  })

  it('shows just the component for a native grab with no file', () => {
    expect(sourceLabel({componentName: 'PaymentCardCell', filePath: '', lineNumber: null})).toBe('PaymentCardCell')
  })

  it('shows just the file when there is no component', () => {
    expect(sourceLabel({componentName: null, filePath: 'src/card.tsx', lineNumber: 7})).toBe('src/card.tsx:7')
  })

  it('returns an empty string when neither component nor file is present', () => {
    expect(sourceLabel({componentName: null, filePath: '', lineNumber: null})).toBe('')
  })
})
