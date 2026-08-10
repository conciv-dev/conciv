import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {ResultImage} from '../src/tools/styled/result-image.js'

describe('ResultImage', () => {
  it('renders the image with the given alt text', async () => {
    render(() => <ResultImage src="data:image/png;base64,QUJD" alt="canvas draw" />)
    await expect.element(page.getByRole('img', {name: 'canvas draw'})).toBeVisible()
  })
})
