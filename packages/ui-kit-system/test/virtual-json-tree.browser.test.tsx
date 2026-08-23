import 'virtual:uno.css'
import {render} from '@solidjs/testing-library'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import {VirtualJsonTree} from '../src/virtual-json-tree.js'

const SHELL = 'json-tree w-full max-h-[13.75rem] overflow-auto text-[0.6875rem]'
const LABELS = Array.from({length: 100}, (_, index) => `row-${index}`)

const FIRST_LEAF = '0: "row-0"'
const LAST_LEAF = '99: "row-99"'

function payload(): unknown {
  return {items: LABELS, summary: {total: LABELS.length}}
}

function mount(defaultExpandedDepth: number): void {
  render(() => (
    <VirtualJsonTree
      data={payload()}
      defaultExpandedDepth={defaultExpandedDepth}
      collapseStringsAfterLength={60}
      maxPreviewItems={5}
      groupArraysAfterLength={20}
      class={SHELL}
      arrow={<ChevronRight size={12} aria-hidden="true" />}
    />
  ))
}

it('keeps only the rows near the viewport in the DOM when every branch is open', async () => {
  mount(2)

  await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).toBeVisible()

  const rows = page.getByRole('treeitem').all()
  expect(rows.length).toBeGreaterThan(1)
  expect(rows.length).toBeLessThan(40)

  await expect.element(page.getByRole('treeitem', {name: LAST_LEAF})).not.toBeInTheDocument()
})

it('opens the top level and leaves the deeper branches closed', async () => {
  mount(1)

  await expect.element(page.getByRole('treeitem', {name: /^items:/})).toHaveAttribute('aria-expanded', 'false')
  await expect.element(page.getByRole('treeitem', {name: /^summary:/})).toHaveAttribute('aria-expanded', 'false')
  await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).not.toBeInTheDocument()
})

it('shows the children of a hundred-child branch when it is opened', async () => {
  mount(1)

  await page.getByRole('button', {name: /^items:/}).click()

  await expect.element(page.getByRole('treeitem', {name: /^items:/})).toHaveAttribute('aria-expanded', 'true')
  await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).toBeVisible()

  const rows = page.getByRole('treeitem').all()
  expect(rows.length).toBeLessThan(40)
})

it('brings the last row into the window when focus jumps to the end of the tree', async () => {
  mount(2)
  await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).toBeVisible()

  await userEvent.tab()
  await userEvent.keyboard('{End}')

  await expect.element(page.getByRole('treeitem', {name: LAST_LEAF})).toBeVisible()
  await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).not.toBeInTheDocument()
})

it('opens and closes the focused branch from the keyboard', async () => {
  mount(1)
  await expect.element(page.getByRole('tree')).toBeVisible()

  await userEvent.tab()
  await userEvent.keyboard('{ArrowDown}')

  const control = page.getByRole('button', {name: /^items:/})
  await expect.element(control).toHaveFocus()
  expect(control.element().matches(':focus-visible')).toBe(true)

  await userEvent.keyboard('{ArrowRight}')
  await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).toBeVisible()

  await userEvent.keyboard('{ArrowLeft}')
  await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).not.toBeInTheDocument()
  await expect.element(control).toHaveFocus()
})
