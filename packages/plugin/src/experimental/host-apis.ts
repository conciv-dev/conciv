import type {JSX} from 'solid-js'
import type {Store} from 'solid-js/store'
import type {StandardSchemaV1} from '@standard-schema/spec'
import type {Ref as LocationRef} from '../schema/location.js'
import type {ConcivClient} from '../client/promise/index.js'
import type {Persisted, StoreFrom, StoreType} from './core.js'
import type {IconName} from './icon-name.js'
import type {Link} from './registries.js'

export interface ServerRef {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly password?: string
  readonly client: ConcivClient
  readonly local: boolean
  readonly builtin: boolean
  readonly compatible: boolean
  readonly connected: boolean
}

export interface SessionRef {
  readonly key: string
  readonly id: string
  readonly tab: string
  readonly server: ServerRef
  readonly pending: boolean
  readonly location: LocationRef | undefined
}

export interface ComposerFile {
  type: 'file'
  path: string
  selection?: {
    startLine: number
    endLine: number
    startChar: number
    endChar: number
  }
  preview?: string
  comment?: string
  commentId?: string
  commentOrigin?: 'review' | 'file'
}

export interface ComposerNote {
  type: 'note'
  origin: string
  commentId: string
  label: string
  title?: string
  subtitle?: string
  icon: IconName
  subject: string
  comment: string
  href?: string
  live?: {
    readonly subject: string
    readonly href?: string
  }
}

export interface ComposerQuote {
  type: 'quote'
  commentId: string
  text: string
  comment?: string
  source: {
    readonly label: string
    readonly icon: IconName
    readonly subject: string
  }
}

/**
 * Positions a quote's optional comment editor beside its source, in viewport pixels. Called after the first editor
 * measurement, on scroll and resize, and when reactive values it reads change. The editor holds its opening bottom
 * edge as its input grows upward. Return undefined when the source is unavailable to use the composer tile instead.
 * Never persisted.
 *
 * @param size - The current editor width and its frozen opening height; never called with an unmeasured zero height.
 * @example
 * const anchor: ComposerQuoteAnchor = (size) => ({ top: 200, left: 400 - size.width / 2 })
 */
export type ComposerQuoteAnchor = (size: {width: number; height: number}) =>
  | {
      top: number
      left: number
    }
  | undefined

export interface ComposerFocusOptions {
  anchor?: ComposerQuoteAnchor
}

export interface ComposerModel {
  providerId: string
  modelId: string
  variant?: string
}

export interface Composer {
  /**
   * The prompt's text, as plain text: a mention reads as its `@` text, and attachments and attached parts are left
   * out. Empty until the session's draft loads. Reactive.
   *
   * @example
   * const empty = () => screen.composer.text().trim() === ""
   */
  text(): string
  /**
   * Inserts plain text into the prompt as typing would, at the cursor the user last left in it, else at the end, and
   * moves the cursor after it. Selected text is not replaced. The text is not parsed: `@path` stays text rather than a
   * mention, and line breaks stay line breaks. Focus stays where it is; call `focus` to move it. Before the session's
   * draft loads, it waits and applies in call order. Does nothing for empty text.
   *
   * @param text - The text to insert.
   *
   * @example
   * screen.composer.insert(`Explain ${path}`)
   */
  insert(text: string): void
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly setText: ((text: string) => void) | undefined
  model(): ComposerModel | undefined
  /**
   * Selects the model for the routed session's next prompts, as picking it in the model picker does. Without
   * `variant`, the model keeps the variant the picker would show for it. Returns false, and changes nothing, while the
   * model catalog loads, when no connected provider offers the model, and when the model has no such variant.
   *
   * @param model - The model, and optionally its variant.
   */
  setModel(model: ComposerModel): boolean
  /**
   * Selects a variant of the current model, as the composer's variant control does. Returns false, and changes
   * nothing, when there is no current model and when the model has no such variant.
   *
   * @param variant - The variant. Undefined selects the model's default.
   */
  setVariant(variant: string | undefined): boolean
  /**
   * Attaches a file, a note or a quote to the next prompt. Focus stays where it is; call `focus` to move it. Before
   * the session's draft loads, it waits and applies in call order.
   *
   * @param part - The part to attach.
   */
  attach(part: ComposerFile | ComposerNote | ComposerQuote): void
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly quotable: (() => boolean) | undefined
  /**
   * Moves focus to the prompt, at its cursor. With the `commentId` of an attached quote, opens that quote's comment
   * editor instead. While the composer is not shown, such as while a panel replaces the chat, the prompt keeps its
   * focus and the comment editor opens once the composer shows.
   *
   * @param commentId - The attached quote whose comment editor to open. Omit it to focus the prompt.
   * @param options - Optional placement beside the quote's source. Omit to anchor to its composer tile.
   */
  focus(commentId?: string, options?: ComposerFocusOptions): void
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly update:
    | ((
        id: string,
        patch: {
          readonly comment?: string
          readonly preview?: string
        },
      ) => void)
    | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly detach: ((id: string) => void) | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly focused: (() => boolean) | undefined
}

export interface MountedSession extends SessionRef {
  readonly visit: object
  readonly directory: string
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly local: boolean | undefined
}

export interface SessionScreen {
  readonly composer: Composer
}

export interface Screen {
  current(): SessionScreen | undefined
}

export interface Sessions {
  list(): readonly SessionRef[]
  current(): MountedSession | undefined
}

export type PanelState = 'closed' | 'open' | 'active' | 'visible'

export interface OpenOptions {
  readonly tab?: 'open' | 'preview' | 'append' | 'select'
  readonly background?: boolean
}

export interface Layout {
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly narrow: (() => boolean) | undefined
  ready(): boolean
  /**
   * Opens a panel tab. Works for sessions that are not mounted. Opening a tab its panel does not list, or a
   * `transient` tab, stores nothing. Writes (`open`, `close`, `toggle`) made while `session.location` is unknown wait
   * until it is known, and apply in order.
   *
   * @param key - `${plugin}:${tab id}`.
   * @param session - The session whose strip changes.
   * @param options - How the tab lands; see `OpenOptions`.
   */
  open(key: string, session: SessionRef, options?: OpenOptions): void
  /**
   * Removes a tab from the strip and calls its panel's `close`.
   *
   * @param key - `${plugin}:${tab id}`.
   * @param session - The session whose strip changes.
   */
  close(key: string, session: SessionRef): void
  /**
   * Closes a visible tab, else opens it.
   *
   * @param key - `${plugin}:${tab id}`.
   * @param session - The session whose strip changes.
   */
  toggle(key: string, session: SessionRef): void
  /**
   * Hides the pane that shows a visible tab without closing the tab. Does nothing unless `state` is "visible". Opening
   * the tab again shows its pane.
   *
   * @param key - `${plugin}:${tab id}`.
   * @param session - The session whose pane hides.
   */
  hide(key: string, session: SessionRef): void
  /**
   * Where a key stands. "closed" while the session's location is unknown and before the app interface mounts.
   * Reactive.
   *
   * @param key - `${plugin}:${tab id}`.
   * @param session - Any session.
   */
  state(key: string, session: SessionRef): PanelState
  /**
   * This plugin's tab ids stored in the session's strip, mounted or not. Empty while the session's location is
   * unknown, as `state` is then "closed", and before the app interface mounts. Reactive.
   *
   * @param session - Any session.
   */
  stored(session: SessionRef): readonly string[]
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly scroll:
    | {
        /**
         * The stored offset; undefined when none is stored, the location is unknown, or the app interface is not
         * mounted.
         *
         * @param session - Any session.
         * @param key - Your own key, e.g. a panel key.
         */
        get(
          session: SessionRef,
          key: string,
        ):
          | {
              readonly x: number
              readonly y: number
            }
          | undefined
        /**
         * Stores an offset. Waits while the session's location is unknown.
         *
         * @param session - Any session.
         * @param key - Your own key, e.g. a panel key.
         * @param value - The offset.
         */
        set(
          session: SessionRef,
          key: string,
          value: {
            readonly x: number
            readonly y: number
          },
        ): void
      }
    | undefined
  /**
   * Opens Settings.
   *
   * @param page - A `SettingsPage` id you contributed, or a host page tab; defaults to `general`.
   */
  settings(page?: string): void
  /**
   * Opens a new draft session in a directory on a server with its prompt filled in, for the user to review and send.
   * Does nothing when the app does not list the server.
   *
   * @param input - Where the draft runs and what it asks.
   *
   * @example
   * ```ts
   * ctx.layout.draft({ server: session.server.id, directory: session.directory, prompt: "Set up the project" })
   * ```
   */
  draft(input: {readonly server: string; readonly directory: string; readonly prompt: string}): void
}

export type StorageScope =
  | 'global'
  | {
      readonly server: string
      readonly directory?: string
    }
  | {
      readonly session: SessionRef
    }

export interface StoreOptions<S extends StandardSchemaV1<unknown, object>> {
  readonly schema: S
  readonly initial: StoreType<S>
  readonly scope?: StorageScope
  readonly from?: StoreFrom | readonly StoreFrom[]
}

export interface Storage {
  /**
   * Opens a durable, schema-decoded store. For keys only known at runtime, such as one per server and directory;
   * declare `stores` in the definition for keys known up front. Derive nothing from it, such as a request, before
   * `value` is defined.
   *
   * @param key - The store's key in your namespace.
   * @param options - Its schema, initial value, scope and older homes.
   */
  store<S extends StandardSchemaV1<unknown, object>>(key: string, options: StoreOptions<S>): Persisted<StoreType<S>>
  /**
   * Window-local state that survives plugin reloads, but not a page reload. The first open of a key creates it; later
   * opens return the same store and ignore `initial`.
   *
   * @param key - The store's key in your namespace.
   * @param options - The store's options.
   * @returns The store and its setter, which edits a draft.
   */
  memory<T extends object>(
    key: string,
    options: {
      readonly initial: T
    },
  ): readonly [Store<T>, (mutation: (draft: T) => void) => void]
  /**
   * Deletes the value, so opening the key again reads its `initial`. Pass the store's `scope` and `from`: an older key
   * `from` names is deleted too, so it is never imported again. A server or session store's removal waits, in call
   * order, until the app interface mounts and the session's location is known.
   *
   * @param key - The store's key in your namespace.
   * @param options - The store's scope and older homes.
   */
  remove(
    key: string,
    options?: {
      readonly scope?: StorageScope
      readonly from?: StoreFrom | readonly StoreFrom[]
    },
  ): void
}

export interface System {
  /**
   * Copies text to the clipboard.
   *
   * @param text - The text to copy.
   */
  copy(text: string): Promise<void>
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly save: ((file: {readonly name: string; readonly content: string}) => Promise<boolean>) | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly openExternal: ((url: string) => void) | undefined
}

export interface Desktop {
  /**
   * Opens a file in the user's editor, at a position when one is given.
   *
   * @param path - An absolute path, or a path relative to the engine's directory.
   * @param position - The line, and optionally the column, to open at, from 1.
   *
   * @example
   * ```ts
   * await ctx.desktop?.launch(frame.file, { line: frame.line, column: frame.column })
   * ```
   */
  launch(
    path: string,
    position?: {
      readonly line: number
      readonly column?: number
    },
  ): Promise<void>
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly reveal: ((path: string) => Promise<boolean>) | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly installed: ((app: string) => Promise<boolean>) | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly pick: ((options?: PickOptions) => Promise<readonly string[]>) | undefined
}

export interface PickOptions {
  readonly directory?: boolean
  readonly multiple?: boolean
  readonly title?: string
  readonly extensions?: readonly string[]
}

export interface Appearance {
  /**
   * The CSS font family the user chose; the default mono font before the app interface mounts. Reactive.
   *
   * @param kind - `mono`, the code font.
   */
  font(kind: 'mono'): string
  /**
   * The color scheme the interface shows, with "System" resolved to the system's current scheme. Before the app
   * interface mounts, the system's scheme. Reactive.
   * - `light`: dark text on light backgrounds.
   * - `dark`: light text on dark backgrounds.
   *
   * @example
   * ```ts
   * const background = () => (ctx.appearance.mode() === "dark" ? "#000" : "#fff")
   * ```
   */
  mode(): 'light' | 'dark'
}

export interface Router {
  routing(): boolean
  path(): string
}

export interface Keybinds {
  /**
   * Display parts of a published command's effective keybind, e.g. ["Ctrl", "K"]. Empty when unbound. Reactive.
   *
   * @param command - A published command id, `${plugin}.${id}`.
   */
  keybind(command: string): readonly string[]
  /**
   * Display parts of a chord the app does not own, e.g. "mod+shift+c" that a page handles itself.
   *
   * @param bind - A chord in keybind syntax.
   */
  keys(bind: string): readonly string[]
  /**
   * The event matches a published command's effective keybind.
   *
   * @param command - A published command id.
   * @param event - The keyboard event.
   */
  matches(command: string, event: KeyboardEvent): boolean
}

export interface Links {
  /**
   * Routes a local link to the LinkHandler with the highest priority that matches it.
   *
   * @param link - The link to open.
   * @returns False when no handler matches.
   */
  open(link: Link): boolean
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly exists: ((link: Link) => boolean | Promise<boolean>) | undefined
}

export interface DialogHandle {
  close(): void
}

export interface Dialogs {
  /**
   * Opens a dialog above the open ones. Opening is deferred to a transition, so a dialog opened while its owner ends
   * never shows. Before the app interface mounts, as during setup, the dialog waits and shows after the interface's
   * first render. A render that throws closes the dialog and records the error.
   *
   * @param render - Renders the dialog's content; receives the dialog's handle, so the content can close itself.
   * @param options - How the dialog opens.
   * @returns The dialog's handle.
   *
   * @example
   * ```ts
   * const dialog = ctx.dialogs.open((dialog) => <Confirm onDone={dialog.close} />)
   * ```
   */
  open(
    render: (dialog: DialogHandle) => JSX.Element,
    options?: {
      readonly replace?: boolean
    },
  ): DialogHandle
  active(): boolean
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly confirm: ((options: ConfirmOptions) => Promise<boolean>) | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly alert: ((options: AlertOptions) => Promise<void>) | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly prompt: ((options: PromptOptions) => Promise<string | undefined>) | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly select: (<T>(options: SelectOptions<T>) => Promise<T | undefined>) | undefined
}

export interface ConfirmOptions {
  readonly title: string
  readonly description?: string
  readonly confirm?: string
  readonly cancel?: string
  readonly danger?: boolean
}

export interface AlertOptions {
  readonly title: string
  readonly description?: string
  readonly ok?: string
}

export interface PromptOptions {
  readonly title: string
  readonly description?: string
  readonly placeholder?: string
  readonly value?: string
  readonly secret?: boolean
  readonly submit?: string
}

export interface SelectOption<T> {
  readonly title: string
  readonly value: T
  readonly description?: string
  readonly group?: string
}

export interface SelectOptions<T> {
  readonly title: string
  readonly placeholder?: string
  readonly options: readonly SelectOption<T>[]
  readonly current?: T
}

export interface ToastAction {
  readonly label: string
  run(): void
}

export interface ToastOptions {
  readonly title: string
  readonly description?: string
  readonly variant?: 'default' | 'success' | 'error' | 'loading'
  readonly icon?: IconName
  readonly duration?: number
  readonly persistent?: boolean
  readonly actions?: readonly ToastAction[]
}

export interface ToastHandle {
  dismiss(): void
}

export interface Toasts {
  /**
   * Shows a toast at once, also before the app interface mounts: it appears as soon as the window shows its toasts.
   * Showing a toast equal to one still showing (same title, description, variant, duration, persistence and action
   * labels) replaces that one instead of stacking a copy.
   *
   * @param options - What the toast shows.
   * @returns The toast's handle.
   */
  show(options: ToastOptions): ToastHandle
}

export interface NotifyOptions {
  readonly title: string
  readonly message?: string
  readonly variant?: 'default' | 'error'
  readonly session?: {
    readonly server: string
    readonly id: string
  }
  readonly sound?: boolean
  readonly id?: string
}

export interface NotifyResult {
  readonly notification: boolean
  readonly sound: boolean
}

export interface Attention {
  /**
   * Sends a system notification while no window of the app has focus, and plays a sound, each only when the user's
   * notification settings for `variant` allow it. Clicking the notification brings the window forward and opens
   * `session`, when given. Before the app interface mounts, it waits for it.
   *
   * @param options - What to send.
   * @returns What it did; never rejects.
   */
  notify(options: NotifyOptions): Promise<NotifyResult>
}

export interface Commands {
  /**
   * Runs a command: a published plugin command (`${plugin}.${id}`, any plugin's) or one of the app's own. The app's
   * command ids are not a stable API and may change between releases. A command that is listed but disabled does not
   * run. A command that runs async work is not awaited.
   *
   * @param id - The command's id.
   * @returns False when no enabled command has the id, and before the app interface mounts, when the app has
   *   registered no commands yet.
   */
  run(id: string): boolean
}

export interface ShellTab {
  readonly key: string
  readonly session: SessionRef | undefined
  readonly active: boolean
}

export interface Tabs {
  list(): readonly ShellTab[]
  /**
   * Opens a session as a tab at the end of the strip, or keeps its open tab where it is. Does nothing when the app
   * does not list the server. A session id the server does not know still opens a tab, which shows the app's
   * "session not found" page.
   *
   * @param session - The session's server and id.
   * @param options - Whether to show the tab.
   *
   * @example
   * ```ts
   * ctx.tabs.open({ server: session.server.id, id: session.id }, { focus: true })
   * ```
   */
  open(
    session: {
      readonly server: string
      readonly id: string
    },
    options?: {
      readonly focus?: boolean
    },
  ): void
  /**
   * Shows an open tab, as a click on it does. Does nothing when no open tab has the key.
   *
   * @param key - The tab's `ShellTab.key`.
   */
  focus(key: string): void
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly move: ((key: string, index: number) => void) | undefined
  /**
   * Closes an open tab, as the user does. Does nothing when no open tab has the key.
   *
   * @param key - The tab's `ShellTab.key`.
   */
  close(key: string): void
}

export interface UiIconProps {
  readonly name: IconName
  readonly size?: 'small' | 'normal' | 'large'
  readonly class?: string
}

export interface UiButtonProps {
  readonly children: JSX.Element
  readonly onClick?: (event: MouseEvent) => void
  readonly variant?: 'neutral' | 'contrast' | 'ghost' | 'ghost-muted' | 'danger'
  readonly size?: 'small' | 'normal' | 'large'
  readonly icon?: IconName
  readonly disabled?: boolean
  readonly busy?: boolean
  readonly type?: 'button' | 'submit'
  readonly autofocus?: boolean
  readonly class?: string
}

export interface UiIconButtonProps {
  readonly icon: IconName
  readonly label: string
  readonly onClick?: (event: MouseEvent) => void
  readonly variant?: 'neutral' | 'ghost' | 'ghost-muted'
  readonly size?: 'small' | 'normal' | 'large'
  readonly disabled?: boolean
  readonly pressed?: boolean
  readonly busy?: boolean
  readonly class?: string
}

export interface UiTooltipProps {
  readonly value: JSX.Element
  readonly keys?: readonly string[]
  readonly placement?: 'top' | 'bottom' | 'left' | 'right'
  readonly children: JSX.Element
}

export interface UiMenuItem {
  readonly type?: 'item'
  readonly label: string
  readonly icon?: IconName
  readonly keys?: readonly string[]
  readonly disabled?: boolean
  onSelect(): void
}

export interface UiMenuSeparator {
  readonly type: 'separator'
}

export interface UiMenuGroup {
  readonly type: 'group'
  readonly label: string
  readonly items: readonly UiMenuItem[]
}

export type UiMenuEntry = UiMenuItem | UiMenuSeparator | UiMenuGroup

export interface UiMenuProps {
  readonly label: string
  readonly items: readonly UiMenuEntry[]
  readonly trigger?: 'icon' | 'button'
  readonly icon?: IconName
  readonly placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  readonly disabled?: boolean
}

export interface UiMenuGroupProps {
  readonly label: string
  readonly children: JSX.Element
}

export interface UiMenuSubProps {
  readonly label: string
  readonly icon?: IconName
  readonly disabled?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly children: JSX.Element
}

export interface UiLoaderProps {
  readonly size?: 'small' | 'normal' | 'large'
  readonly class?: string
}

export interface UiDialogProps {
  readonly title: string
  readonly description?: string
  readonly children?: JSX.Element
  readonly footer?: JSX.Element
  readonly size?: 'fit' | 'normal' | 'large' | 'x-large'
  readonly closable?: boolean
}

export interface UiSwitchProps {
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
  readonly label: string
  readonly hideLabel?: boolean
  readonly description?: string
  readonly disabled?: boolean
}

export interface UiTextInputProps {
  readonly value: string
  readonly onInput: (value: string) => void
  readonly label: string
  readonly placeholder?: string
  readonly onSubmit?: (value: string) => void
  readonly type?: 'text' | 'password' | 'search' | 'url'
  readonly size?: 'normal' | 'large'
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly autofocus?: boolean
  readonly class?: string
}

export interface UiKeybindProps {
  readonly keys: readonly string[]
  readonly class?: string
}

export interface UiMarkdownProps {
  readonly text: string
  readonly class?: string
}

export interface UiCodeProps {
  readonly content: string
  readonly language?: string
  readonly class?: string
}

export interface UiSelectOption<T extends string = string> {
  readonly value: T
  readonly label: string
}

export interface UiSelectProps<T extends string = string> {
  readonly options: readonly UiSelectOption<T>[]
  readonly value: T | undefined
  readonly onChange: (value: T) => void
  readonly label: string
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  readonly class?: string
}

export interface UiSettingsLayoutProps {
  readonly title: string
  readonly description?: string
  readonly actions?: JSX.Element
  readonly children: JSX.Element
}

export interface UiSettingsSectionProps {
  readonly title?: string
  readonly children: JSX.Element
  readonly footer?: JSX.Element
}

export interface UiSettingsRowProps {
  readonly title: JSX.Element
  readonly description?: JSX.Element
  readonly id?: string
  readonly children?: JSX.Element
}

export interface Ui {
  /**
   * An icon from the app's catalog, the artwork every `icon` field of the SDK names.
   *
   * @param props - The icon and its size.
   *
   * @example
   * ```tsx
   * <ctx.ui.Icon name="link" size="small" />
   * ```
   */
  Icon(props: UiIconProps): JSX.Element
  /**
   * A button with text.
   *
   * @param props - Its text, look and action.
   *
   * @example
   * ```tsx
   * <ctx.ui.Button variant="contrast" busy={saving()} onClick={save}>Save</ctx.ui.Button>
   * ```
   */
  Button(props: UiButtonProps): JSX.Element
  /**
   * A button that shows only an icon. Wrap it in `Tooltip` to show its label on hover.
   *
   * @param props - Its icon, accessible name and action.
   *
   * @example
   * ```tsx
   * <ctx.ui.IconButton icon="rotate-cw" label="Reload" onClick={reload} />
   * ```
   */
  IconButton(props: UiIconButtonProps): JSX.Element
  /**
   * A tooltip on an element.
   *
   * @param props - What it shows, and the element.
   *
   * @example
   * ```tsx
   * <ctx.ui.Tooltip value="Toggle" keys={ctx.keybinds.keybind(`${ctx.id}.toggle`)}>
   *   <ctx.ui.IconButton icon="columns-2" label="Toggle" onClick={toggle} />
   * </ctx.ui.Tooltip>
   * ```
   */
  Tooltip(props: UiTooltipProps): JSX.Element
  /**
   * A button that opens a menu of actions.
   *
   * @param props - The trigger and the entries.
   *
   * @example
   * ```tsx
   * <ctx.ui.Menu label="More" items={[{ label: "Delete", icon: "trash", onSelect: remove }]} />
   * ```
   */
  Menu(props: UiMenuProps): JSX.Element
  /**
   * One action row of a menu the host renders, so your rows look and behave like the host's: keyboard navigation,
   * the muted icon, shortcut chips, and the menu closing on a pick. It also renders inside `Ui.MenuGroup` and
   * `Ui.MenuSub`. It takes the fields of an entry of `UiMenuProps.items`. Outside a menu it throws, so the host
   * records the error and the contribution renders nothing.
   *
   * @param props - The row's text, icon, keys and action.
   *
   * @example
   * ```tsx
   * <ctx.ui.MenuItem label="Usage" icon="clock" onSelect={open} />
   * ```
   */
  MenuItem(props: UiMenuItem): JSX.Element
  /**
   * A line between rows of a menu the host renders, or of a `Ui.MenuSub`, with the menu's spacing and color.
   *
   * @example
   * ```tsx
   * <>
   *   <ctx.ui.MenuSeparator />
   *   <ctx.ui.MenuItem label="Usage" onSelect={open} />
   * </>
   * ```
   */
  MenuSeparator(): JSX.Element
  /**
   * Rows of a menu the host renders under a heading, as `UiMenuGroup` groups the entries of `Ui.Menu`. Outside a menu
   * it throws, as `Ui.MenuItem` does.
   *
   * @param props - The heading and its rows.
   *
   * @example
   * ```tsx
   * <ctx.ui.MenuGroup label="Usage">
   *   <ctx.ui.MenuItem label="Today" onSelect={() => open("today")} />
   *   <ctx.ui.MenuItem label="This month" onSelect={() => open("month")} />
   * </ctx.ui.MenuGroup>
   * ```
   */
  MenuGroup(props: UiMenuGroupProps): JSX.Element
  /**
   * A row of a menu the host renders that opens a submenu beside it, with the host's chevron. Outside a menu it
   * throws, as `Ui.MenuItem` does.
   *
   * @param props - The row's text and icon, and the submenu's rows.
   *
   * @example
   * ```tsx
   * <ctx.ui.MenuSub label="Open in" icon="external-link">
   *   <For each={apps()}>{(app) => <ctx.ui.MenuItem label={app.name} onSelect={() => launch(app)} />}</For>
   * </ctx.ui.MenuSub>
   * ```
   */
  MenuSub(props: UiMenuSubProps): JSX.Element
  /**
   * The app's loading indicator, for anything that loads, connects or runs that is not the AI working.
   *
   * @param props - Its size.
   *
   * @example
   * ```tsx
   * <Show when={!loading()} fallback={<ctx.ui.Loader />}>{content()}</Show>
   * ```
   */
  Loader(props: UiLoaderProps): JSX.Element
  /**
   * The app's dialog frame: title, content and buttons.
   *
   * @param props - The title, content and buttons.
   *
   * @example
   * ```tsx
   * <ctx.ui.Dialog title="About" footer={<ctx.ui.Button onClick={close}>Done</ctx.ui.Button>}>
   *   {body}
   * </ctx.ui.Dialog>
   * ```
   */
  Dialog(props: UiDialogProps): JSX.Element
  /**
   * An on/off switch with a label.
   *
   * @param props - Its state, label and handler.
   *
   * @example
   * ```tsx
   * <ctx.ui.Switch label="Wrap lines" checked={wrap()} onChange={setWrap} />
   * ```
   */
  Switch(props: UiSwitchProps): JSX.Element
  /**
   * A one-line text field.
   *
   * @param props - Its text, accessible name and handlers.
   *
   * @example
   * ```tsx
   * <ctx.ui.TextInput label="Name" value={name()} onInput={setName} onSubmit={save} />
   * ```
   */
  TextInput(props: UiTextInputProps): JSX.Element
  /**
   * A select that opens a list of choices, as the app's settings rows do. The value is a string; `T` narrows it to
   * your choices' values.
   *
   * @param props - The choices, the selected value and its handler.
   *
   * @example
   * ```tsx
   * <ctx.ui.Select
   *   label="Period"
   *   options={[
   *     { value: "day", label: "Day" },
   *     { value: "month", label: "Month" },
   *   ]}
   *   value={period()}
   *   onChange={setPeriod}
   * />
   * ```
   */
  Select<T extends string>(props: UiSelectProps<T>): JSX.Element
  /**
   * Keys shown as chips, as menus and tooltips show shortcuts.
   *
   * @param props - The keys.
   *
   * @example
   * ```tsx
   * <ctx.ui.Keybind keys={ctx.keybinds.keybind(`${ctx.id}.toggle`)} />
   * ```
   */
  Keybind(props: UiKeybindProps): JSX.Element
  /**
   * Markdown rendered as the timeline renders a message: headings, lists, tables, links and highlighted code blocks
   * with a copy button. On the session screen, links to local files open through the LinkHandler contributions, and
   * fenced code blocks show `CodeBlock` and `CodeBlockAction` contributions, as the timeline's do; inside a
   * `CodeBlock` render they do not. Rendering is asynchronous: the block fills in shortly after it mounts.
   *
   * @param props - The Markdown source.
   *
   * @example
   * ```tsx
   * <ctx.ui.Markdown text={summary()} />
   * ```
   */
  Markdown(props: UiMarkdownProps): JSX.Element
  /**
   * A read-only code block, highlighted as the timeline highlights code, with a copy button. It always shows the code:
   * `CodeBlock` and `CodeBlockAction` contributions do not apply, so a `CodeBlock` render can show its source through
   * it. Highlighting is asynchronous: the block fills in shortly after it mounts.
   *
   * @param props - The code and its language.
   *
   * @example
   * ```tsx
   * <ctx.ui.Code content={JSON.stringify(config, null, 2)} language="json" />
   * ```
   */
  Code(props: UiCodeProps): JSX.Element
  /**
   * The frame of a settings page of your own (a `SettingsPage` without `page`): the app's page header with the title,
   * then your sections, spaced as the app's pages are. Search that reveals the page itself highlights its header.
   * Render the settings components from a `SettingsPage`.
   *
   * @param props - The page's title, header actions and sections.
   *
   * @example
   * ```tsx
   * ctx.add(SettingsPage, {
   *   id: "acme",
   *   title: "Acme",
   *   render: () => (
   *     <ctx.ui.SettingsLayout title="Acme" description="Sync settings">
   *       <ctx.ui.SettingsSection title="Sync">{rows()}</ctx.ui.SettingsSection>
   *     </ctx.ui.SettingsLayout>
   *   ),
   * })
   * ```
   */
  SettingsLayout(props: UiSettingsLayoutProps): JSX.Element
  /**
   * A section of settings rows: an optional heading over the app's bordered list. Render it in `SettingsLayout`, or on
   * its own as a section on a host page (`SettingsPage.page`).
   *
   * @param props - The heading and rows.
   *
   * @example
   * ```tsx
   * <ctx.ui.SettingsSection title="Sync">
   *   <ctx.ui.SettingsRow id="acme-sync" title="Sync" description="Keep notes in step">
   *     <ctx.ui.Switch label="Sync" hideLabel checked={sync()} onChange={setSync} />
   *   </ctx.ui.SettingsRow>
   * </ctx.ui.SettingsSection>
   * ```
   */
  SettingsSection(props: UiSettingsSectionProps): JSX.Element
  /**
   * One setting, as the app's own settings rows show it: its title and description, and its control at the end. Render
   * it in a `SettingsSection`, or on its own as rows in a host section (`SettingsPage.section`), where it lines up
   * with the host's rows.
   *
   * @param props - The setting's text, search id and control.
   *
   * @example
   * ```tsx
   * <ctx.ui.SettingsRow id="acme-sync" title="Sync" description="Keep notes in step">
   *   <ctx.ui.Switch label="Sync" hideLabel checked={sync()} onChange={setSync} />
   * </ctx.ui.SettingsRow>
   * ```
   */
  SettingsRow(props: UiSettingsRowProps): JSX.Element
}

export interface Servers {
  list(): readonly string[]
  /**
   * A listed server's ref. The same ref for the same id.
   *
   * @param id - The server's id, as `list()` returns it.
   * @returns Undefined while the app does not list the server.
   *
   * @example
   * ```ts
   * const builtin = () => ctx.servers.list().map((id) => ctx.servers.get(id)).find((server) => server?.builtin)
   * ```
   */
  get(id: string): ServerRef | undefined
}
