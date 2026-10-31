import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {ResultImage} from '../src/tools/styled/result-image.js'

describe('ResultImage', () => {
  it('renders the image with the given alt text', async () => {
    render(() => (
      <ResultImage
        src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="
        alt="canvas draw"
      />
    ))
    await expect.element(page.getByRole('img', {name: 'canvas draw'})).toBeVisible()
  })
})
