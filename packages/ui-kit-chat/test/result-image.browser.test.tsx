import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {ResultImage} from '../src/tools/styled/result-image.js'

describe('ResultImage', () => {
  it('renders the image with the given alt text', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    render(() => <ResultImage src="data:image/png;base64,QUJD" alt="canvas draw" />, host)
    await expect.element(page.getByRole('img', {name: 'canvas draw'})).toBeVisible()
  })
})
