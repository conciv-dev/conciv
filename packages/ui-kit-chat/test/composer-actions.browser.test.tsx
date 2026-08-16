import 'virtual:uno.css'
import {createSignal, For, Show, splitProps, type JSX} from 'solid-js'
import {range} from 'es-toolkit'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {ComposerActions, ComposerActionsHost} from '../src/primitives/composer/composer-actions.js'
import {mountView} from './mount-view.js'

const WIDE_PX = 400
const ONE_SLOT_PX = 170
const NO_SLOT_PX = 100
const LEADING_BUDGET_PX = 220
const RACE_PX = 230

function Glyph(): JSX.Element {
  return <span aria-hidden="true" class="size-5 block" />
}

function Slots(props: {count: number}): JSX.Element {
  const [local] = splitProps(props, ['count'])
  return <For each={range(local.count)}>{() => <span class="size-8.5 block" />}</For>
}

function Fixture(props: {
  width: number
  maxInlineAuto?: number
  leading?: JSX.Element
  trailing?: JSX.Element
  onOverflowDismissed?: () => void
  children: JSX.Element
}): JSX.Element {
  const [local] = splitProps(props, [
    'width',
    'maxInlineAuto',
    'leading',
    'trailing',
    'onOverflowDismissed',
    'children',
  ])
  return (
    <div style={{width: `${local.width}px`}}>
      <ComposerActionsHost
        triggerContent={<Glyph />}
        maxInlineAuto={local.maxInlineAuto}
        leading={local.leading}
        trailing={local.trailing ?? <Slots count={1} />}
        onOverflowDismissed={local.onOverflowDismissed}
      >
        {local.children}
      </ComposerActionsHost>
    </div>
  )
}

function StatusRegion(props: {picks: string[]}): JSX.Element {
  const [local] = splitProps(props, ['picks'])
  return <p role="status">{local.picks.join(' ')}</p>
}

function GrabRoot(): JSX.Element {
  return (
    <ComposerActions.Root id="fixture.grab" priority={40}>
      <ComposerActions.Button visible="always" tooltip="Select an element" onClick={() => undefined}>
        <Glyph />
      </ComposerActions.Button>
    </ComposerActions.Root>
  )
}

function NewSessionRoot(): JSX.Element {
  return (
    <ComposerActions.Root id="fixture.new" priority={30}>
      <ComposerActions.Button tooltip="Start a new session" onClick={() => undefined}>
        <Glyph />
      </ComposerActions.Button>
      <ComposerActions.DropdownItem value="new" label="Start a new session" onSelect={() => undefined} />
    </ComposerActions.Root>
  )
}

function CompactRoot(props: {onSelect?: () => void}): JSX.Element {
  const [local] = splitProps(props, ['onSelect'])
  return (
    <ComposerActions.Root id="fixture.compact" priority={20}>
      <ComposerActions.Button tooltip="Compress the conversation" onClick={() => undefined}>
        <Glyph />
      </ComposerActions.Button>
      <ComposerActions.DropdownItem
        value="compact"
        label="Compress the conversation"
        onSelect={() => local.onSelect?.()}
      />
    </ComposerActions.Root>
  )
}

function StandardRoots(props: {onCompactSelect?: () => void}): JSX.Element {
  const [local] = splitProps(props, ['onCompactSelect'])
  return (
    <>
      <GrabRoot />
      <NewSessionRoot />
      <CompactRoot onSelect={local.onCompactSelect} />
    </>
  )
}

function MenuOnlyRoot(props: {onSelect: () => void}): JSX.Element {
  const [local] = splitProps(props, ['onSelect'])
  return (
    <ComposerActions.Root id="fixture.menu-only" priority={5}>
      <ComposerActions.DropdownItem value="only" label="Menu only action" onSelect={() => local.onSelect()} />
    </ComposerActions.Root>
  )
}

const trigger = () => page.getByRole('button', {name: 'More composer actions'})
const overflowMenu = () => page.getByRole('menu', {name: 'More composer actions'})
const grabButton = () => page.getByRole('button', {name: 'Select an element'})
const newSessionButton = () => page.getByRole('button', {name: 'Start a new session'})
const compactButton = () => page.getByRole('button', {name: 'Compress the conversation'})
const compactItem = () => page.getByRole('menuitem', {name: 'Compress the conversation'})
const status = () => page.getByRole('status')

it('keeps every action inline and hides the overflow trigger when the row is wide', async () => {
  mountView(() => (
    <Fixture width={WIDE_PX}>
      <StandardRoots />
    </Fixture>
  ))

  await expect.element(grabButton()).toBeVisible()
  await expect.element(newSessionButton()).toBeVisible()
  await expect.element(compactButton()).toBeVisible()
  await expect.element(trigger()).not.toBeInTheDocument()
})

it('keeps every auto action in the overflow menu when the host caps inline auto actions at zero', async () => {
  const [picks, setPicks] = createSignal<string[]>(['idle'])
  mountView(() => (
    <>
      <StatusRegion picks={picks()} />
      <Fixture width={WIDE_PX} maxInlineAuto={0}>
        <StandardRoots onCompactSelect={() => setPicks((current) => [...current, 'compact'])} />
      </Fixture>
    </>
  ))

  await expect.element(grabButton()).toBeVisible()
  await expect.element(trigger()).toBeVisible()
  await expect.element(newSessionButton()).not.toBeInTheDocument()
  await expect.element(compactButton()).not.toBeInTheDocument()

  await userEvent.click(trigger())
  await expect.element(page.getByRole('menuitem', {name: 'Start a new session'})).toBeVisible()
  await userEvent.click(compactItem())

  await expect.element(status()).toHaveTextContent('idle compact')
})

it('shows only as many auto actions inline as the cap allows while the row has room for more', async () => {
  mountView(() => (
    <Fixture width={WIDE_PX} maxInlineAuto={1}>
      <StandardRoots />
    </Fixture>
  ))

  await expect.element(grabButton()).toBeVisible()
  await expect.element(newSessionButton()).toBeVisible()
  await expect.element(compactButton()).not.toBeInTheDocument()
  await expect.element(trigger()).toBeVisible()
})

it('collapses the lowest-priority action into the overflow menu and runs it from there', async () => {
  const [picks, setPicks] = createSignal<string[]>(['idle'])
  mountView(() => (
    <>
      <StatusRegion picks={picks()} />
      <Fixture width={ONE_SLOT_PX}>
        <StandardRoots onCompactSelect={() => setPicks((current) => [...current, 'compact'])} />
      </Fixture>
    </>
  ))

  await expect.element(newSessionButton()).toBeVisible()
  await expect.element(compactButton()).not.toBeInTheDocument()
  await expect.element(trigger()).toHaveAttribute('aria-haspopup', 'menu')
  await expect.element(trigger()).toHaveAttribute('aria-expanded', 'false')

  await userEvent.click(trigger())

  await expect.element(trigger()).toHaveAttribute('aria-expanded', 'true')
  await userEvent.click(compactItem())

  await expect.element(status()).toHaveTextContent('idle compact')
  await expect.element(compactItem()).not.toBeInTheDocument()
})

it('keeps a pinned action inline while every auto action collapses', async () => {
  mountView(() => (
    <Fixture width={NO_SLOT_PX}>
      <GrabRoot />
      <NewSessionRoot />
    </Fixture>
  ))

  await expect.element(trigger()).toBeVisible()
  await expect.element(grabButton()).toBeVisible()
  await expect.element(newSessionButton()).not.toBeInTheDocument()
})

it('charges the leading region against the fit budget', async () => {
  const [crowded, setCrowded] = createSignal(true)
  mountView(() => (
    <Fixture
      width={LEADING_BUDGET_PX}
      leading={
        <Show when={crowded()}>
          <Slots count={1} />
        </Show>
      }
    >
      <GrabRoot />
      <NewSessionRoot />
      <CompactRoot />
    </Fixture>
  ))

  await expect.element(newSessionButton()).toBeVisible()
  await expect.element(compactButton()).not.toBeInTheDocument()

  setCrowded(false)

  await expect.element(compactButton()).toBeVisible()
  await expect.element(trigger()).not.toBeInTheDocument()
})

it('hides a button-only action when it collapses and keeps the trigger away', async () => {
  mountView(() => (
    <Fixture width={NO_SLOT_PX}>
      <GrabRoot />
      <ComposerActions.Root id="fixture.solo" priority={10}>
        <ComposerActions.Button tooltip="Solo action" onClick={() => undefined}>
          <Glyph />
        </ComposerActions.Button>
      </ComposerActions.Root>
    </Fixture>
  ))

  await expect.element(grabButton()).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Solo action'})).not.toBeInTheDocument()
  await expect.element(trigger()).not.toBeInTheDocument()
})

it('renders an item-only action in the overflow menu even when the row is wide', async () => {
  const [picks, setPicks] = createSignal<string[]>(['idle'])
  mountView(() => (
    <>
      <StatusRegion picks={picks()} />
      <Fixture width={WIDE_PX}>
        <MenuOnlyRoot onSelect={() => setPicks((current) => [...current, 'menu-only'])} />
      </Fixture>
    </>
  ))

  await expect.element(trigger()).toBeVisible()
  await userEvent.click(trigger())
  await userEvent.click(page.getByRole('menuitem', {name: 'Menu only action'}))

  await expect.element(status()).toHaveTextContent('idle menu-only')
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
      <StatusRegion picks={picks()} />
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
        <MenuOnlyRoot onSelect={() => setPicks((current) => [...current, 'menu-only'])} />
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

  await expect.element(status()).toHaveTextContent('idle menu-only')
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
      <StatusRegion picks={picks()} />
      <Fixture width={width()} onOverflowDismissed={() => setPicks((current) => [...current, 'dismissed'])}>
        <StandardRoots />
      </Fixture>
    </>
  ))

  await userEvent.click(trigger())
  await expect.element(compactItem()).toBeVisible()

  setWidth(WIDE_PX)

  await expect.element(status()).toHaveTextContent('idle dismissed')
  await expect.element(overflowMenu()).not.toBeInTheDocument()
  await expect.element(compactButton()).toBeVisible()
})

it('keeps the overflow menu open when leading and trailing regions resize together', async () => {
  const [swapped, setSwapped] = createSignal(false)
  const [picks, setPicks] = createSignal<string[]>(['idle'])
  mountView(() => (
    <>
      <StatusRegion picks={picks()} />
      <Fixture
        width={RACE_PX}
        onOverflowDismissed={() => setPicks((current) => [...current, 'dismissed'])}
        leading={
          <Show when={!swapped()}>
            <Slots count={2} />
          </Show>
        }
        trailing={
          <Show when={swapped()} fallback={<Slots count={1} />}>
            <Slots count={2} />
            <span role="img" aria-label="Wide trailing marker" class="size-8.5 block" />
          </Show>
        }
      >
        <StandardRoots />
      </Fixture>
    </>
  ))

  await userEvent.click(trigger())
  await expect.element(compactItem()).toBeVisible()

  setSwapped(true)

  await expect.element(page.getByRole('img', {name: 'Wide trailing marker'})).toBeVisible()
  await expect.element(status()).toHaveTextContent(/^idle$/)
  await expect.element(compactItem()).toBeVisible()
})

it('opens with Enter, highlights with ArrowDown and returns focus to the trigger on Escape', async () => {
  mountView(() => (
    <Fixture width={NO_SLOT_PX}>
      <StandardRoots />
    </Fixture>
  ))

  await expect.element(trigger()).toBeVisible()
  await userEvent.tab()
  await userEvent.tab()
  await expect.element(trigger()).toHaveFocus()

  await userEvent.keyboard('{Enter}')
  await expect.element(compactItem()).toBeVisible()

  await userEvent.keyboard('{ArrowDown}')
  await expect.element(overflowMenu()).toHaveAttribute('aria-activedescendant')

  await userEvent.keyboard('{Escape}')
  await expect.element(overflowMenu()).not.toBeInTheDocument()
  await expect.element(trigger()).toHaveFocus()
})
