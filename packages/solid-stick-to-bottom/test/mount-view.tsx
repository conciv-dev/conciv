import {render} from '@solidjs/testing-library'
import type {JSX} from 'solid-js'

export function mountView(view: () => JSX.Element): HTMLElement {
  return render(view).container
}
