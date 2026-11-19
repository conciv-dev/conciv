import {describe, expect, test} from 'vitest'
import {render, screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {Checkbox} from './checkbox.js'

describe('checkbox', () => {
  test('a click on the labelled checkbox checks it', async () => {
    const user = userEvent.setup()
    render(() => <Checkbox label="Remember me" />)
    const box = screen.getByRole('checkbox', {name: 'Remember me'})
    expect(box).not.toBeChecked()
    await user.click(box)
    expect(box).toBeChecked()
  })
})
