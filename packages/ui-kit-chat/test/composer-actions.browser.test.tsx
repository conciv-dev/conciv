import 'virtual:uno.css'
import {createSignal, splitProps, type JSX} from 'solid-js'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {ComposerActions, ComposerActionsHost} from '../src/primitives/composer/composer-actions.js'
import {mountView} from './mount-view.js'

const WIDE_PX = 400
const ONE_SLOT_PX = 170
const NO_SLOT_PX = 100

function Glyph(): JSX.Element {
  return <span aria-hidden="true" class="size-5 block" />
}

function Fixture(props: {width: number; onOverflowDismissed?: () => void; children: JSX.Element}): JSX.Element {
  const [local] = splitProps(props, ['width', 'onOverflowDismissed', 'children'])
  return (
    <div style={{width: `${local.width}px`}}>
      <ComposerActionsHost
        triggerContent={<Glyph />}
        trailing={<span class="size-8.5 block" />}
        onOverflowDismissed={local.onOverflowDismissed}
      >
        {local.children}
      </ComposerActionsHost>
    </div>
  )
}

const trigger = () => page.getByRole('button', {name: 'More composer actions'})
const overflowMenu = () => page.getByRole('menu', {name: 'More composer actions'})

it('keeps every action inline and hides the overflow trigger when the row is wide', async () => {
  mountView(() => (
    <Fixture width={WIDE_PX}>
      <ComposerActions.Root id="fixture.grab" priority={40}>
        <ComposerActions.Button visible="always" tooltip="Select an element" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
      </ComposerActions.Root>
      <ComposerActions.Root id="fixture.new" priority={30}>
        <ComposerActions.Button tooltip="Start a new session" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
        <ComposerActions.DropdownItem value="new" label="Start a new session" onSelect={() => undefined} />
      </ComposerActions.Root>
      <ComposerActions.Root id="fixture.compact" priority={20}>
        <ComposerActions.Button tooltip="Compress the conversation" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
        <ComposerActions.DropdownItem value="compact" label="Compress the conversation" onSelect={() => undefined} />
      </ComposerActions.Root>
    </Fixture>
  ))

  await expect.element(page.getByRole('button', {name: 'Select an element'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Start a new session'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Compress the conversation'})).toBeVisible()
  await expect.element(trigger()).not.toBeInTheDocument()
})

it('collapses the lowest-priority action into the overflow menu and runs it from there', async () => {
  const [picks, setPicks] = createSignal<string[]>(['idle'])
  mountView(() => (
    <>
      <p role="status">{picks().join(' ')}</p>
      <Fixture width={ONE_SLOT_PX}>
        <ComposerActions.Root id="fixture.grab" priority={40}>
          <ComposerActions.Button visible="always" tooltip="Select an element" onClick={() => undefined}>
            <Glyph />
          </ComposerActions.Button>
        </ComposerActions.Root>
        <ComposerActions.Root id="fixture.new" priority={30}>
          <ComposerActions.Button tooltip="Start a new session" onClick={() => undefined}>
            <Glyph />
          </ComposerActions.Button>
          <ComposerActions.DropdownItem value="new" label="Start a new session" onSelect={() => undefined} />
        </ComposerActions.Root>
        <ComposerActions.Root id="fixture.compact" priority={20}>
          <ComposerActions.Button tooltip="Compress the conversation" onClick={() => undefined}>
            <Glyph />
          </ComposerActions.Button>
          <ComposerActions.DropdownItem
            value="compact"
            label="Compress the conversation"
            onSelect={() => setPicks((current) => [...current, 'compact'])}
          />
        </ComposerActions.Root>
      </Fixture>
    </>
  ))

  await expect.element(page.getByRole('button', {name: 'Start a new session'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Compress the conversation'})).not.toBeInTheDocument()
  await expect.element(trigger()).toHaveAttribute('aria-haspopup', 'menu')
  await expect.element(trigger()).toHaveAttribute('aria-expanded', 'false')

  await userEvent.click(trigger())

  await expect.element(trigger()).toHaveAttribute('aria-expanded', 'true')
  await userEvent.click(page.getByRole('menuitem', {name: 'Compress the conversation'}))

  await expect.element(page.getByRole('status')).toHaveTextContent('idle compact')
  await expect.element(page.getByRole('menuitem', {name: 'Compress the conversation'})).not.toBeInTheDocument()
})

it('keeps a pinned action inline while every auto action collapses', async () => {
  mountView(() => (
    <Fixture width={NO_SLOT_PX}>
      <ComposerActions.Root id="fixture.grab" priority={40}>
        <ComposerActions.Button visible="always" tooltip="Select an element" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
      </ComposerActions.Root>
      <ComposerActions.Root id="fixture.new" priority={30}>
        <ComposerActions.Button tooltip="Start a new session" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
        <ComposerActions.DropdownItem value="new" label="Start a new session" onSelect={() => undefined} />
      </ComposerActions.Root>
    </Fixture>
  ))

  await expect.element(trigger()).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Select an element'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Start a new session'})).not.toBeInTheDocument()
})

it('hides a button-only action when it collapses and keeps the trigger away', async () => {
  mountView(() => (
    <Fixture width={NO_SLOT_PX}>
      <ComposerActions.Root id="fixture.grab" priority={40}>
        <ComposerActions.Button visible="always" tooltip="Select an element" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
      </ComposerActions.Root>
      <ComposerActions.Root id="fixture.solo" priority={10}>
        <ComposerActions.Button tooltip="Solo action" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
      </ComposerActions.Root>
    </Fixture>
  ))

  await expect.element(page.getByRole('button', {name: 'Select an element'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Solo action'})).not.toBeInTheDocument()
  await expect.element(trigger()).not.toBeInTheDocument()
})

it('renders an item-only action in the overflow menu even when the row is wide', async () => {
  const [picks, setPicks] = createSignal<string[]>(['idle'])
  mountView(() => (
    <>
      <p role="status">{picks().join(' ')}</p>
      <Fixture width={WIDE_PX}>
        <ComposerActions.Root id="fixture.menu-only" priority={10}>
          <ComposerActions.DropdownItem
            value="only"
            label="Menu only action"
            onSelect={() => setPicks((current) => [...current, 'menu-only'])}
          />
        </ComposerActions.Root>
      </Fixture>
    </>
  ))

  await expect.element(trigger()).toBeVisible()
  await userEvent.click(trigger())
  await userEvent.click(page.getByRole('menuitem', {name: 'Menu only action'}))

  await expect.element(page.getByRole('status')).toHaveTextContent('idle menu-only')
})

it('keeps a multi-item action contiguous and ordered by priority in the overflow menu', async () => {
  mountView(() => (
    <Fixture width={NO_SLOT_PX}>
      <ComposerActions.Root id="fixture.alpha" priority={30}>
        <ComposerActions.Button tooltip="Alpha" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
        <ComposerActions.DropdownItem value="one" label="Alpha one" onSelect={() => undefined} />
        <ComposerActions.DropdownItem value="two" label="Alpha two" onSelect={() => undefined} />
      </ComposerActions.Root>
      <ComposerActions.Root id="fixture.bravo" priority={20}>
        <ComposerActions.Button tooltip="Bravo" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
        <ComposerActions.DropdownItem value="one" label="Bravo one" onSelect={() => undefined} />
      </ComposerActions.Root>
    </Fixture>
  ))

  await userEvent.click(trigger())

  await expect.element(overflowMenu()).toHaveTextContent(/Alpha one\s*Alpha two\s*Bravo one/)
})

it('disables both renderings of a disabled root and keeps its menu item out of reach', async () => {
  const [width, setWidth] = createSignal(WIDE_PX)
  const [picks, setPicks] = createSignal<string[]>(['idle'])
  mountView(() => (
    <>
      <p role="status">{picks().join(' ')}</p>
      <Fixture width={width()}>
        <ComposerActions.Root id="fixture.enabled" priority={20}>
          <ComposerActions.Button tooltip="Enabled action" onClick={() => undefined}>
            <Glyph />
          </ComposerActions.Button>
          <ComposerActions.DropdownItem value="run" label="Enabled action" onSelect={() => undefined} />
        </ComposerActions.Root>
        <ComposerActions.Root id="fixture.disabled" priority={10} disabled={() => true}>
          <ComposerActions.Button tooltip="Disabled action" onClick={() => undefined}>
            <Glyph />
          </ComposerActions.Button>
          <ComposerActions.DropdownItem value="run" label="Disabled action" onSelect={() => undefined} />
        </ComposerActions.Root>
        <ComposerActions.Root id="fixture.menu-only" priority={5}>
          <ComposerActions.DropdownItem
            value="only"
            label="Menu only action"
            onSelect={() => setPicks((current) => [...current, 'menu-only'])}
          />
        </ComposerActions.Root>
      </Fixture>
    </>
  ))

  await expect.element(page.getByRole('button', {name: 'Disabled action'})).toBeDisabled()

  setWidth(120)

  await expect.element(page.getByRole('button', {name: 'Disabled action'})).not.toBeInTheDocument()
  await userEvent.click(trigger())
  await expect.element(page.getByRole('menuitem', {name: 'Disabled action'})).toHaveAttribute('aria-disabled', 'true')

  await userEvent.keyboard('{ArrowDown}')
  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByRole('status')).toHaveTextContent('idle menu-only')
})

it('renders only the last root registered under a duplicated id', async () => {
  mountView(() => (
    <Fixture width={WIDE_PX}>
      <ComposerActions.Root id="fixture.duplicate" priority={30}>
        <ComposerActions.Button tooltip="First action" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
      </ComposerActions.Root>
      <ComposerActions.Root id="fixture.duplicate" priority={30}>
        <ComposerActions.Button tooltip="Second action" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
      </ComposerActions.Root>
    </Fixture>
  ))

  await expect.element(page.getByRole('button', {name: 'Second action'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'First action'})).not.toBeInTheDocument()
})

it('closes the overflow menu and hands focus back to the app when the row widens', async () => {
  const [width, setWidth] = createSignal(ONE_SLOT_PX)
  const [picks, setPicks] = createSignal<string[]>(['idle'])
  mountView(() => (
    <>
      <p role="status">{picks().join(' ')}</p>
      <Fixture width={width()} onOverflowDismissed={() => setPicks((current) => [...current, 'dismissed'])}>
        <ComposerActions.Root id="fixture.grab" priority={40}>
          <ComposerActions.Button visible="always" tooltip="Select an element" onClick={() => undefined}>
            <Glyph />
          </ComposerActions.Button>
        </ComposerActions.Root>
        <ComposerActions.Root id="fixture.new" priority={30}>
          <ComposerActions.Button tooltip="Start a new session" onClick={() => undefined}>
            <Glyph />
          </ComposerActions.Button>
          <ComposerActions.DropdownItem value="new" label="Start a new session" onSelect={() => undefined} />
        </ComposerActions.Root>
        <ComposerActions.Root id="fixture.compact" priority={20}>
          <ComposerActions.Button tooltip="Compress the conversation" onClick={() => undefined}>
            <Glyph />
          </ComposerActions.Button>
          <ComposerActions.DropdownItem value="compact" label="Compress the conversation" onSelect={() => undefined} />
        </ComposerActions.Root>
      </Fixture>
    </>
  ))

  await userEvent.click(trigger())
  await expect.element(page.getByRole('menuitem', {name: 'Compress the conversation'})).toBeVisible()

  setWidth(WIDE_PX)

  await expect.element(page.getByRole('status')).toHaveTextContent('idle dismissed')
  await expect.element(overflowMenu()).not.toBeInTheDocument()
  await expect.element(page.getByRole('button', {name: 'Compress the conversation'})).toBeVisible()
})

it('opens with Enter, highlights with ArrowDown and returns focus to the trigger on Escape', async () => {
  mountView(() => (
    <Fixture width={NO_SLOT_PX}>
      <ComposerActions.Root id="fixture.grab" priority={40}>
        <ComposerActions.Button visible="always" tooltip="Select an element" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
      </ComposerActions.Root>
      <ComposerActions.Root id="fixture.new" priority={30}>
        <ComposerActions.Button tooltip="Start a new session" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
        <ComposerActions.DropdownItem value="new" label="Start a new session" onSelect={() => undefined} />
      </ComposerActions.Root>
      <ComposerActions.Root id="fixture.compact" priority={20}>
        <ComposerActions.Button tooltip="Compress the conversation" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
        <ComposerActions.DropdownItem value="compact" label="Compress the conversation" onSelect={() => undefined} />
      </ComposerActions.Root>
    </Fixture>
  ))

  await expect.element(trigger()).toBeVisible()
  await userEvent.tab()
  await userEvent.tab()
  await expect.element(trigger()).toHaveFocus()

  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('menuitem', {name: 'Compress the conversation'})).toBeVisible()

  await userEvent.keyboard('{ArrowDown}')
  await expect.element(overflowMenu()).toHaveAttribute('aria-activedescendant')

  await userEvent.keyboard('{Escape}')
  await expect.element(overflowMenu()).not.toBeInTheDocument()
  await expect.element(trigger()).toHaveFocus()
})
