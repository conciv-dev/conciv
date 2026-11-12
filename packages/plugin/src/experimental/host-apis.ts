import type {JSX} from 'solid-js'
import type {Store} from 'solid-js/store'
import type {z} from 'zod'
import type {Ref as LocationRef} from '../location.js'
import type {ServerRef} from '../servers.js'
import type {Persisted, StoreFrom, StoreType} from './core.js'
import type {IconName} from './icon-name.js'
import type {Link} from './registries.js'

export type {ServerRef, Servers} from '../servers.js'

/** A session owned by an open shell tab, mounted or not. */
export interface SessionRef {
  /** `${server id}\n${session id}`: unique across servers. Key per-session state by it. */
  readonly key: string
  /** The session's id on its server. */
  readonly id: string
  /** The key of the shell tab that owns the session. */
  readonly tab: string
  /** The session's server. */
  readonly server: ServerRef
  /** The server is still creating the session. */
  readonly pending: boolean
  /**
   * Where the session runs. Undefined until the server reports it, and again while it is unknown. Layout reads return
   * nothing meanwhile; layout writes wait for it.
   */
  readonly location: LocationRef | undefined
}

/** A workspace file attached to the composer, with an optional line selection and comment. */
export interface ComposerFile {
  /** The part kind. */
  type: 'file'
  /** The workspace path. */
  path: string
  /** The selected text, when only part of the file is attached. */
  selection?: {
    /** First selected line. */
    startLine: number
    /** Last selected line. */
    endLine: number
    /** First selected character on `startLine`. */
    startChar: number
    /** Character after the selection on `endLine`. */
    endChar: number
  }
  /** Text the chip previews. */
  preview?: string
  /** The user's comment on the attachment. */
  comment?: string
  /** The id that `Composer.update` and `detach` take. */
  commentId?: string
  /**
   * The view the comment was made in.
   * - `review`: the review panel.
   * - `file`: a file tab.
   */
  commentOrigin?: 'review' | 'file'
}

/**
 * A reference to something other than workspace lines, such as an element picked in a page, with an optional comment.
 * The model reads "The user referenced <subject>." when `comment` is empty, otherwise
 * "The user made the following comment regarding <subject>: <comment>".
 */
export interface ComposerNote {
  /** The part kind. */
  type: 'note'
  /** The plugin that attached it. Opening the chip routes `Links.open({ href, origin })` to its LinkHandler. */
  origin: string
  /** The id that `Composer.update` and `detach` take. */
  commentId: string
  /** Chip text naming the subject, e.g. `button#save`. */
  label: string
  /** Primary heading while `comment` is empty, e.g. `button#save`. Defaults to `label`; ignored with a comment. */
  title?: string
  /** Plain-text footer with or without a comment, e.g. `Browser annotation`. Defaults to `label` when omitted. */
  subtitle?: string
  /** Chip icon. */
  icon: IconName
  /** What the comment is about, for the model. Quote untrusted text such as page content. */
  subject: string
  /** The user's comment. An empty string attaches the subject without a comment. */
  comment: string
  /** The link opening the chip routes, with `origin`. */
  href?: string
  /**
   * Replaces `subject` and `href` while the note stays in this page, for references only this page can resolve (e.g.
   * a page element ref). A stored draft and a sent message drop it.
   */
  live?: {
    /** The subject while the note stays in this page. */
    readonly subject: string
    /** The link while the note stays in this page. */
    readonly href?: string
  }
}

/**
 * Text the user quoted from something the plugin shows, such as terminal output, with an optional comment. It
 * renders like a quote from the session timeline, under the source's icon and label. The model reads "The user quoted
 * the following from <subject>:" and the text, each line prefixed with `> `, then the comment when there is one.
 */
export interface ComposerQuote {
  /** The part kind. */
  type: 'quote'
  /** The id that `Composer.update`, `detach` and `focus` take. */
  commentId: string
  /** The quoted text, as plain text. */
  text: string
  /** The user's comment on the quote. Omit it to let the user add one from the chip. */
  comment?: string
  /** Where the text came from. It stays with the draft and the sent message. */
  source: {
    /** Chip text while the quote has no comment, e.g. `Terminal`. */
    readonly label: string
    /** Chip icon. */
    readonly icon: IconName
    /** Where the text came from, for the model, e.g. `the terminal`. */
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
export type ComposerQuoteAnchor = (size: {
  /** Current editor width in pixels. */
  width: number
  /** Measured opening height in pixels, unchanged as the input grows. */
  height: number
}) =>
  | {
      /** Physical distance from the viewport's top edge, in pixels. Clamped to the viewport. */
      top: number
      /** Physical distance from the viewport's left edge, in pixels. Clamped to the viewport. */
      left: number
    }
  | undefined

/** Optional placement for a newly attached quote's comment editor. */
export interface ComposerFocusOptions {
  /** Positions the editor beside its source instead of its tile. Omit for tile placement. */
  anchor?: ComposerQuoteAnchor
}

/** A model the composer sends a prompt with, as the model picker names it. */
export interface ComposerModel {
  /** The provider's id, e.g. `anthropic`. */
  providerId: string
  /** The model's id within its provider, e.g. `claude-sonnet-4-5`. */
  modelId: string
  /** The model's variant, e.g. `high`. Undefined for the model's default. */
  variant?: string
}

/**
 * The session screen's composer: the routed session's next prompt, with its text, its attached parts and the model it
 * is sent with. Nothing here sends the prompt; the user does. A write to the draft (`insert`, `setText`, `attach`,
 * `update`, `detach`) made before the session's stored draft loads waits for it, then applies to the session routed
 * when it was made, in call order with the other draft writes; the stored draft is never replaced.
 */
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
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Replaces the prompt's text, mentions included, and moves the cursor to the end. Attachments and attached parts
   * stay. Before the session's draft loads, it waits and applies in call order.
   */
  readonly setText: ((text: string) => void) | undefined
  /**
   * The model the next prompt is sent with: the user's choice for the routed session, else the app's default.
   * Undefined while the model catalog loads, and when no connected provider offers the choice. Reactive.
   */
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
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Whether the composer takes quotes now. Reactive.
   *
   * @example
   * if (screen.composer.quotable?.()) screen.composer.attach(quote)
   */
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
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Changes an attached part. Files, notes and quotes alike; a note or a quote takes only `comment`. Before the
   * session's draft loads, it waits and applies in call order.
   */
  readonly update:
    | ((
        id: string,
        patch: {
          /** The new comment. */
          readonly comment?: string
          /** The new preview, for a file. */
          readonly preview?: string
        },
      ) => void)
    | undefined
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Removes an attached part, by its `commentId`. Before the session's draft loads, it waits and applies in call order.
   */
  readonly detach: ((id: string) => void) | undefined
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Whether keyboard focus is in the prompt now. Not reactive: read it where you act, such as in `Command.run`.
   */
  readonly focused: (() => boolean) | undefined
}

/**
 * A routed session on the session screen: its identity and data, and nothing that acts on whichever session is
 * routed. Slot inputs and panel renders receive it, and `Sessions.current` returns it. One frozen object per routed
 * session: a new one each time a session is routed, and once its shell tab is known. `key`, `id`, `tab`, `server`,
 * `directory` and `visit` never change on one object. A render receives each new object through its reactive input
 * instead of remounting, so read `input.session` or `props.session` where you use it rather than copying it. Key
 * per-session state by `key`. The composer follows the route instead, so it belongs to the screen: see `Screen`.
 */
export interface MountedSession extends SessionRef {
  /** This routing visit: a new object each time the session is routed, e.g. after leaving it and coming back. */
  readonly visit: object
  /** The session's workspace directory. */
  readonly directory: string
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * The session runs in the project root rather than a worktree. Reactive.
   */
  readonly local: boolean | undefined
}

/**
 * The session screen: the app's view that shows the routed session, and stays the same object while it routes A, then
 * B, then A again. It follows the route on purpose: its composer is the screen's, and every action through it targets
 * the session routed at that moment. Read it where you act, or pass it to the views that render inside it; a
 * `MountedSession` you keep never acts on another session.
 */
export interface SessionScreen {
  /** The routed session's composer. */
  readonly composer: Composer
}

/** The session screen, while it routes the mounted session. */
export interface Screen {
  /**
   * The mounted session screen: the same object for as long as it stays mounted, whichever session it routes. Defined
   * exactly when `Sessions.current()` is, after the screen's first render; undefined while no session is routed and
   * before the app interface mounts. Panel callbacks and session slots receive a non-null screen directly. Reactive.
   */
  current(): SessionScreen | undefined
}

/** The sessions of open shell tabs. */
export interface Sessions {
  /** Sessions owned by open shell tabs. Empty until the app interface mounts. Reactive. */
  list(): readonly SessionRef[]
  /**
   * The routed, mounted session: a new object each time a session is routed. Undefined while no session is routed,
   * before the app interface mounts and during the screen's first render. Defined exactly when `Screen.current()`
   * is, after that first render. Panel and session-slot inputs are available during render directly. Reactive.
   */
  current(): MountedSession | undefined
}

/**
 * Where a panel key stands in a session.
 * - `closed`: not in the strip.
 * - `open`: in the strip, not the tab its pane shows.
 * - `active`: the tab its pane shows, with the pane hidden.
 * - `visible`: the tab its pane shows, on screen.
 */
export type PanelState = 'closed' | 'open' | 'active' | 'visible'

/** How `Layout.open` places a tab. */
export interface OpenOptions {
  /**
   * How the tab lands in the strip. Defaults to `open`.
   * - `open`: select it, reusing the preview slot.
   * - `preview`: select it as the new preview tab.
   * - `append`: add it at the end without selecting it, changing neither the region nor the preview tab.
   * - `select`: add it at the end and select it, keeping the preview tab.
   */
  readonly tab?: 'open' | 'preview' | 'append' | 'select'
  /**
   * Keep the current view. Pass it when the user stays where they are (a composer chip) or the agent opened the tab.
   * Defaults to false.
   */
  readonly background?: boolean
}

/**
 * The session layout: panel tabs, scroll offsets, and the settings page. Panel keys are `${plugin}:${tab id}`. Nothing
 * throws before the app interface mounts: `ready()` is false, reads return what an empty layout holds (each says its
 * default), and writes (`open`, `close`, `toggle`, `settings`) wait and apply in call order once it mounts.
 */
export interface Layout {
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Viewport under 768px. Reactive.
   */
  readonly narrow: (() => boolean) | undefined
  /** Stored layout (tabs) has loaded; false before the app interface mounts. Reactive. */
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
   * Not implemented yet. Always undefined in this version.
   *
   * Hides the pane that shows a visible tab without closing the tab. Does nothing unless `state` is "visible". Opening
   * the tab again shows its pane.
   */
  readonly hide: ((key: string, session: SessionRef) => void) | undefined
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
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Scroll offsets the host stores per session and key.
   */
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
              /** Horizontal offset in CSS pixels. */
              readonly x: number
              /** Vertical offset in CSS pixels. */
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
            /** Horizontal offset in CSS pixels. */
            readonly x: number
            /** Vertical offset in CSS pixels. */
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
  draft(input: {
    /** The server's `ServerRef.id`. */
    readonly server: string
    /** The directory the new session runs in. */
    readonly directory: string
    /** The prompt the draft starts with. */
    readonly prompt: string
  }): void
}

/**
 * Where `Storage.store` keeps a value.
 * - `"global"`: one value for the app. The default.
 * - `{ server, directory? }`: one value per server, or per workspace directory on it. Opens once the app interface
 *   mounts; until then `value` is undefined and `update` waits.
 * - `{ session }`: one value per session. Also waits for the session's location; a declared `Store.session` does the
 *   same for every session.
 */
export type StorageScope =
  | 'global'
  | {
      /** The server's `ServerRef.id`. */
      readonly server: string
      /** A workspace directory on that server; omit it for one value per server. */
      readonly directory?: string
    }
  | {
      /** The session. */
      readonly session: SessionRef
    }

/** What `Storage.store` opens. */
export interface StoreOptions<S extends z.ZodObject> {
  /** Decodes the stored JSON, as `StoreDeclaration.schema` does. */
  readonly schema: S
  /** The value before anything is stored, and after `remove`. */
  readonly initial: StoreType<S>
  /** Where the value lives. Defaults to `"global"`. */
  readonly scope?: StorageScope
  /**
   * Imports an older key of the same storage once (the raw stored key, e.g. `"plugin.acme.recent"`), or the first of
   * several that holds a value. See `StoreFrom`.
   */
  readonly from?: StoreFrom | readonly StoreFrom[]
}

/** Window storage, in the plugin's namespace (`plugin.<id>.<key>`). A value is undefined until it loads. */
export interface Storage {
  /**
   * Opens a durable, schema-decoded store. For keys only known at runtime, such as one per server and directory;
   * declare `stores` in the definition for keys known up front. Derive nothing from it, such as a request, before
   * `value` is defined.
   *
   * @param key - The store's key in your namespace.
   * @param options - Its schema, initial value, scope and older homes.
   */
  store<S extends z.ZodObject>(key: string, options: StoreOptions<S>): Persisted<StoreType<S>>
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
      /** The value the first open creates. */
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
      /** The store's scope. Defaults to `"global"`. */
      readonly scope?: StorageScope
      /** The store's `from`. */
      readonly from?: StoreFrom | readonly StoreFrom[]
    },
  ): void
}

/** System services that work on every platform. */
export interface System {
  /**
   * Copies text to the clipboard.
   *
   * @param text - The text to copy.
   */
  copy(text: string): Promise<void>
  /**
   * Saves a file: a download on the web.
   *
   * @param file - The suggested name and the content.
   * @returns Always true on the web.
   */
  save(file: {
    /** The suggested file name. */
    readonly name: string
    /** The file's content. */
    readonly content: string
  }): Promise<boolean>
  /**
   * Opens a URL in a new browser tab. For links inside the app, use `Links.open`.
   *
   * @param url - The URL to open.
   */
  openExternal(url: string): void
}

/** Abilities on the user's machine, through the engine. */
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
      /** The line, from 1. */
      readonly line: number
      /** The column, from 1. */
      readonly column?: number
    },
  ): Promise<void>
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Shows a path in the system file manager; resolves false when it could not.
   */
  readonly reveal: ((path: string) => Promise<boolean>) | undefined
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Whether an app is installed.
   */
  readonly installed: ((app: string) => Promise<boolean>) | undefined
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Asks the user for files or folders with the system's open dialog. Resolves with the absolute paths the user
   * picked, in the order the dialog reports them; empty when the user cancelled. Rejects when the dialog cannot open.
   */
  readonly pick: ((options?: PickOptions) => Promise<readonly string[]>) | undefined
}

/** What `Desktop.pick` asks for. */
export interface PickOptions {
  /** Picks folders instead of files. Defaults to false. */
  readonly directory?: boolean
  /** Lets the user pick more than one. Defaults to false. */
  readonly multiple?: boolean
  /** The dialog's title; the system's default title when omitted. Not every system shows it. */
  readonly title?: string
  /** File extensions to offer, without the dot (e.g. `["json"]`); every file when omitted. Ignored for folders. */
  readonly extensions?: readonly string[]
}

/** The user's appearance settings. */
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

/** The app's route. */
export interface Router {
  /** A route transition is in progress. Reactive. */
  routing(): boolean
  /** The current route path with its query string; "" before the app interface mounts. Reactive. */
  path(): string
}

/** The effective keybinds of published commands. */
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

/** Routes local links to the plugins that handle them. */
export interface Links {
  /**
   * Routes a local link to the LinkHandler with the highest priority that matches it.
   *
   * @param link - The link to open.
   * @returns False when no handler matches.
   */
  open(link: Link): boolean
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Whether a link's target exists, so text that names it can be styled as a link. Asks the LinkHandler `open` would
   * use. Resolves false when no handler matches, the handler has no `exists`, or the target does not exist.
   */
  readonly exists: ((link: Link) => boolean | Promise<boolean>) | undefined
}

/** One dialog `Dialogs.open` opened. */
export interface DialogHandle {
  /**
   * Closes this dialog, wherever it is in the stack; another dialog stays open. A dialog that still waits for the app
   * interface never shows. Does nothing once the dialog closed, including when it never opened because its plugin
   * went away first.
   */
  close(): void
}

/**
 * Dialogs. The render runs with this plugin's context. A dialog closes when the owner that opened it ends (the
 * component or `createKeyed` run), else when the plugin goes away.
 */
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
      /** Closes every open dialog first, the host's and other plugins' too. Defaults to false. */
      readonly replace?: boolean
    },
  ): DialogHandle
  /** Some dialog is open. Reactive. */
  active(): boolean
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Asks the user to confirm an action, in the app's own confirmation dialog. Opens as `open` does, with the same
   * lifetime: it waits for the app interface, and closes with the owner that asked, else with the plugin.
   *
   * @param options - The question and its buttons.
   * @returns True only when the user chose the confirm button. False when they chose cancel, pressed Escape or clicked
   *   outside, when another dialog replaced it, and when it closed or never opened because its owner or plugin went
   *   away.
   */
  readonly confirm: ((options: ConfirmOptions) => Promise<boolean>) | undefined
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Tells the user something they must acknowledge, in a dialog with one button. Opens and closes as `confirm` does.
   *
   * @param options - What the dialog says.
   * @returns Resolves once the dialog closes, however it closes.
   */
  readonly alert: ((options: AlertOptions) => Promise<void>) | undefined
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Asks the user for a line of text, in the app's own dialog. Enter submits. Opens and closes as `confirm` does.
   *
   * @param options - The question, the field and its button.
   * @returns The text the user submits, which is never empty: the submit button and Enter do nothing while the field
   *   is empty. Undefined when the user cancels, dismisses the dialog, or it closes with its owner.
   */
  readonly prompt: ((options: PromptOptions) => Promise<string | undefined>) | undefined
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Asks the user to pick one option from a searchable list, in the app's own dialog. Opens and closes as `confirm`
   * does.
   *
   * @param options - The title, the search field and the options.
   * @returns The picked option's `value`; undefined when the user dismisses the dialog or it closes with its owner.
   */
  readonly select: (<T>(options: SelectOptions<T>) => Promise<T | undefined>) | undefined
}

/** What `Dialogs.confirm` asks. */
export interface ConfirmOptions {
  /** The question, as the dialog's title. */
  readonly title: string
  /** More detail under the title, such as what the action cannot undo. Omit it for none. */
  readonly description?: string
  /** The confirm button's label. Defaults to the app's "Confirm". */
  readonly confirm?: string
  /** The cancel button's label. Defaults to the app's "Cancel". */
  readonly cancel?: string
  /**
   * Styles the confirm button as destructive, for an action that deletes or ends something, and starts focus on
   * Cancel. Defaults to false.
   */
  readonly danger?: boolean
}

/** What `Dialogs.alert` says. */
export interface AlertOptions {
  /** The headline, as the dialog's title. */
  readonly title: string
  /** More detail under the title. Omit it for none. */
  readonly description?: string
  /** The button's label. Defaults to the app's "OK". */
  readonly ok?: string
}

/** What `Dialogs.prompt` asks. */
export interface PromptOptions {
  /** The question, as the dialog's title. */
  readonly title: string
  /** More detail under the title. Omit it for none. */
  readonly description?: string
  /** The field's placeholder. Omit it for none. */
  readonly placeholder?: string
  /** The field's initial text, selected so typing replaces it. Defaults to "". */
  readonly value?: string
  /**
   * Hides what the user types, for a password or a token. The host neither stores nor logs the value. Defaults to
   * false.
   */
  readonly secret?: boolean
  /** The submit button's label. Defaults to the app's "Submit". */
  readonly submit?: string
}

/** One option of `Dialogs.select`. */
export interface SelectOption<T> {
  /** The option's label; search matches it. */
  readonly title: string
  /** What `select` resolves with when the user picks this option. */
  readonly value: T
  /** A muted second line; search matches it too. Omit it for none. */
  readonly description?: string
  /** The heading the option lists under. Options of one group list together, in the order first seen. */
  readonly group?: string
}

/** What `Dialogs.select` asks. */
export interface SelectOptions<T> {
  /** The dialog's title. */
  readonly title: string
  /** The search field's placeholder. Defaults to the app's "Search". */
  readonly placeholder?: string
  /** The options, in display order. */
  readonly options: readonly SelectOption<T>[]
  /** The value of the option to highlight first, compared with `===`. Defaults to the first option. */
  readonly current?: T
}

/** A button on a toast. */
export interface ToastAction {
  /** The button's label. */
  readonly label: string
  /** Runs when the user clicks it; the toast then closes. A throw is logged to the console and the toast still closes. */
  run(): void
}

/** What `Toasts.show` shows. */
export interface ToastOptions {
  /** The headline. */
  readonly title: string
  /** More detail under the title. Omit it for none. */
  readonly description?: string
  /**
   * The toast's tone. Defaults to `default`.
   * - `default`: neutral information.
   * - `success`: something finished; shows a check icon unless `icon` is set.
   * - `error`: something failed.
   * - `loading`: something is in progress. Pair it with `persistent` and dismiss it when the work ends.
   */
  readonly variant?: 'default' | 'success' | 'error' | 'loading'
  /** An icon before the title. Omit it for none, or the variant's own. */
  readonly icon?: IconName
  /** Milliseconds before the toast closes itself. Ignored when `persistent` is true. Defaults to the app's 5 seconds. */
  readonly duration?: number
  /** Stays until the user or `dismiss` closes it, instead of closing after `duration`. Defaults to false. */
  readonly persistent?: boolean
  /** Buttons on the toast, in order. Omit it for none. */
  readonly actions?: readonly ToastAction[]
}

/** One toast `Toasts.show` showed. */
export interface ToastHandle {
  /** Closes the toast. Does nothing once it closed. */
  dismiss(): void
}

/**
 * The app's toasts: short messages in a corner of the window that do not take focus. Every toast of a plugin that is
 * still showing closes when the plugin goes away (disabled, reloaded or removed), so no button outlives the code it
 * runs; a toast does not close with the component or `createKeyed` run that showed it.
 */
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

/** What `Attention.notify` sends. */
export interface NotifyOptions {
  /** The notification's headline. */
  readonly title: string
  /** The notification's body. Omit it for none. */
  readonly message?: string
  /**
   * Which of the user's notification settings it follows, both the system notification and the sound. Defaults to
   * `default`.
   * - `default`: the agent finished or needs attention.
   * - `error`: something failed.
   */
  readonly variant?: 'default' | 'error'
  /** The session the notification is about: clicking the notification opens and shows it, as `Tabs.open` does. */
  readonly session?: {
    /** The server's `ServerRef.id`. */
    readonly server: string
    /** The session's id on that server. */
    readonly id: string
  }
  /** Plays the sound the user chose for `variant`, when its sound is on. False never plays one. Defaults to true. */
  readonly sound?: boolean
  /**
   * Shows the notification and plays its sound at most once across the app's windows, each of which runs its own
   * instance of the plugin: the first window to send an id wins, and later sends with that id do nothing. Use an id
   * of the event, such as a run's id. Omit it to always notify.
   */
  readonly id?: string
}

/** What `Attention.notify` did. */
export interface NotifyResult {
  /**
   * The app asked the system to show the notification. False when the user turned it off for `variant`, when one of
   * the app's windows has focus, or when another window already sent `id`. The system may still hide one it was
   * asked to show, for example when the user denied a browser's permission.
   */
  readonly notification: boolean
  /** The sound started. False when `sound` is false, the user turned it off for `variant`, or `id` was sent before. */
  readonly sound: boolean
}

/** Gets the user's attention while they look elsewhere, with the same rules as the app's own notifications. */
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

/** The commands the app runs from its keybinds and slash menu. */
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

/** One tab of the shell's tab strip. */
export interface ShellTab {
  /** The tab's key, `SessionRef.tab` for a session's tab. Stays the same while the tab is open. */
  readonly key: string
  /** The session the tab shows; undefined for a draft. */
  readonly session: SessionRef | undefined
  /** The tab is the one on screen. */
  readonly active: boolean
}

/**
 * The shell's tab strip: the sessions and drafts open as tabs. Nothing throws before the app interface mounts:
 * `list` is empty, and writes wait and apply in call order once it mounts.
 */
export interface Tabs {
  /** The open tabs, in strip order. Reactive. */
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
      /** The server's `ServerRef.id`. */
      readonly server: string
      /** The session's id on that server. */
      readonly id: string
    },
    options?: {
      /** Also shows the tab and the session in it. Defaults to false: the tab opens in the background. */
      readonly focus?: boolean
    },
  ): void
  /**
   * Shows an open tab, as a click on it does. Does nothing when no open tab has the key.
   *
   * @param key - The tab's `ShellTab.key`.
   */
  focus(key: string): void
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Moves an open tab to a place in the strip, from 0, clamped to the strip. Does nothing when no open tab has the
   * key.
   */
  readonly move: ((key: string, index: number) => void) | undefined
  /**
   * Closes an open tab, as the user does. Does nothing when no open tab has the key.
   *
   * @param key - The tab's `ShellTab.key`.
   */
  close(key: string): void
}

/** Props of `Ui.Icon`. */
export interface UiIconProps {
  /** The artwork, by its name in the app's icon catalog. */
  readonly name: IconName
  /**
   * The icon's size. Defaults to `normal`.
   * - `small`: 14px.
   * - `normal`: 16px.
   * - `large`: 20px.
   */
  readonly size?: 'small' | 'normal' | 'large'
  /** Classes of the `svg`, for layout and color: the icon draws in `currentColor`. */
  readonly class?: string
}

/** Props of `Ui.Button`. */
export interface UiButtonProps {
  /** The button's text. */
  readonly children: JSX.Element
  /** Runs when the user clicks the button, or presses Enter or Space on it. Not called while it is disabled or busy. */
  readonly onClick?: (event: MouseEvent) => void
  /**
   * How the button looks. Defaults to `neutral`.
   * - `neutral`: a bordered button for most actions.
   * - `contrast`: the main action of a dialog or form.
   * - `ghost`: no border or background until hovered, for toolbars.
   * - `ghost-muted`: like `ghost`, with muted text, for secondary toolbar actions.
   * - `danger`: an action that deletes or discards.
   */
  readonly variant?: 'neutral' | 'contrast' | 'ghost' | 'ghost-muted' | 'danger'
  /**
   * The button's height. Defaults to `normal`.
   * - `small`: for dense rows.
   * - `normal`: for most places.
   * - `large`: for toolbars that use large icon buttons.
   */
  readonly size?: 'small' | 'normal' | 'large'
  /** An icon before the text. Omit it for none. */
  readonly icon?: IconName
  /** The button cannot be clicked. Defaults to false. */
  readonly disabled?: boolean
  /**
   * The action is running: a loading indicator replaces the icon, and the button cannot be clicked until it is false
   * again. Defaults to false.
   */
  readonly busy?: boolean
  /** `submit` submits the form the button is in. Defaults to `button`. */
  readonly type?: 'button' | 'submit'
  /** Takes focus when its dialog opens, as the app's own dialogs focus their main button. Defaults to false. */
  readonly autofocus?: boolean
  /** Classes of the button, for layout. The app's styles give it its look. */
  readonly class?: string
}

/** Props of `Ui.IconButton`. */
export interface UiIconButtonProps {
  /** The button's icon. */
  readonly icon: IconName
  /** The button's accessible name, which screen readers announce; it is not shown. */
  readonly label: string
  /** Runs when the user clicks the button, or presses Enter or Space on it. Not called while it is disabled or busy. */
  readonly onClick?: (event: MouseEvent) => void
  /**
   * How the button looks. Defaults to `ghost-muted`.
   * - `neutral`: a bordered button.
   * - `ghost`: no border or background until hovered.
   * - `ghost-muted`: like `ghost`, with a muted icon, for toolbars.
   */
  readonly variant?: 'neutral' | 'ghost' | 'ghost-muted'
  /**
   * The button's size. Defaults to `normal`.
   * - `small`: for dense rows.
   * - `normal`: for most places.
   * - `large`: for panel toolbars.
   */
  readonly size?: 'small' | 'normal' | 'large'
  /** The button cannot be clicked. Defaults to false. */
  readonly disabled?: boolean
  /** The button is a toggle that is on: it shows pressed and reports `aria-pressed`. Omit it for a plain button. */
  readonly pressed?: boolean
  /**
   * The action is running: a loading indicator replaces the icon, and the button cannot be clicked until it is false
   * again. Defaults to false.
   */
  readonly busy?: boolean
  /** Classes of the button, for layout. The app's styles give it its look. */
  readonly class?: string
}

/** Props of `Ui.Tooltip`. */
export interface UiTooltipProps {
  /** What the tooltip shows: usually text. */
  readonly value: JSX.Element
  /** Keys shown after `value`, such as `ctx.keybinds.keybind(command)`. Omit it, or pass an empty list, for none. */
  readonly keys?: readonly string[]
  /** Where the tooltip opens from the element. Defaults to `top`; it flips when there is no room. */
  readonly placement?: 'top' | 'bottom' | 'left' | 'right'
  /** The element that shows the tooltip while the pointer rests on it or it has keyboard focus. */
  readonly children: JSX.Element
}

/** An action in `UiMenuProps.items`, and the props of `Ui.MenuItem`. */
export interface UiMenuItem {
  /** Marks the entry as an action. Optional: an entry without `type` is an action. */
  readonly type?: 'item'
  /** The action's text. */
  readonly label: string
  /** An icon before the text. Omit it for none. */
  readonly icon?: IconName
  /** Keys shown at the end of the row, such as `ctx.keybinds.keybind(command)`. Omit it for none. */
  readonly keys?: readonly string[]
  /** The action cannot be chosen. Defaults to false. */
  readonly disabled?: boolean
  /** Runs when the user chooses the action; the menu then closes. */
  onSelect(): void
}

/** A line between entries in `UiMenuProps.items`. */
export interface UiMenuSeparator {
  /** Marks the entry as a separator. */
  readonly type: 'separator'
}

/** Actions under a heading in `UiMenuProps.items`. */
export interface UiMenuGroup {
  /** Marks the entry as a group. */
  readonly type: 'group'
  /** The group's heading. */
  readonly label: string
  /** The group's actions, in order. */
  readonly items: readonly UiMenuItem[]
}

/** One entry of `UiMenuProps.items`: an action, a separator, or a group of actions under a heading. */
export type UiMenuEntry = UiMenuItem | UiMenuSeparator | UiMenuGroup

/** Props of `Ui.Menu`. */
export interface UiMenuProps {
  /** The trigger's accessible name, and its text when `trigger` is `button`. */
  readonly label: string
  /** The menu's entries, in order. */
  readonly items: readonly UiMenuEntry[]
  /**
   * The button that opens the menu. Defaults to `icon`.
   * - `icon`: an icon button, as `Ui.IconButton` with the `ghost-muted` look.
   * - `button`: a button that shows `label`, as `Ui.Button`.
   */
  readonly trigger?: 'icon' | 'button'
  /** The trigger's icon. Defaults to the "more" dots for an `icon` trigger, and to no icon for a `button` trigger. */
  readonly icon?: IconName
  /** Where the menu opens from the trigger. Defaults to `bottom-end`; it flips when there is no room. */
  readonly placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  /** The trigger cannot open the menu. Defaults to false. */
  readonly disabled?: boolean
}

/** Props of `Ui.MenuGroup`. */
export interface UiMenuGroupProps {
  /** The group's heading. */
  readonly label: string
  /** The group's rows, such as `Ui.MenuItem` and `Ui.MenuSub`. */
  readonly children: JSX.Element
}

/** Props of `Ui.MenuSub`. */
export interface UiMenuSubProps {
  /** The text of the row that opens the submenu, which also names the submenu for screen readers. */
  readonly label: string
  /** An icon before the text. Omit it for none. */
  readonly icon?: IconName
  /** The row cannot open the submenu. Defaults to false. */
  readonly disabled?: boolean
  /** Runs with true when the submenu opens and false when it closes, for example to load its rows only while open. */
  readonly onOpenChange?: (open: boolean) => void
  /** The submenu's rows, such as `Ui.MenuItem`, `Ui.MenuSeparator` and `Ui.MenuGroup`. */
  readonly children: JSX.Element
}

/** Props of `Ui.Loader`. */
export interface UiLoaderProps {
  /**
   * The indicator's size. Defaults to `normal`.
   * - `small`: 14px, for buttons and dense rows.
   * - `normal`: 16px.
   * - `large`: 20px, for a pane that loads.
   */
  readonly size?: 'small' | 'normal' | 'large'
  /** Classes of the indicator, for layout and color. */
  readonly class?: string
}

/** Props of `Ui.Dialog`. */
export interface UiDialogProps {
  /** The dialog's title, which also names it for screen readers. */
  readonly title: string
  /** Text under the title. Omit it for none. */
  readonly description?: string
  /** The dialog's content, with the app's dialog padding. It scrolls when it is taller than the dialog. */
  readonly children?: JSX.Element
  /** The dialog's buttons, aligned to the end of its last row. Omit it for none. */
  readonly footer?: JSX.Element
  /**
   * The dialog's size. Defaults to `fit`.
   * - `fit`: 480px wide and as tall as its content.
   * - `normal`: 480 by 368px.
   * - `large`: 640 by 480px.
   * - `x-large`: up to 980 by 600px, smaller in a small window.
   */
  readonly size?: 'fit' | 'normal' | 'large' | 'x-large'
  /**
   * Shows the close button in the header. Escape and a click outside close the dialog either way. Defaults to true.
   */
  readonly closable?: boolean
}

/** Props of `Ui.Switch`. */
export interface UiSwitchProps {
  /** The switch is on. */
  readonly checked: boolean
  /** Runs with the new state when the user flips the switch. Pass it on to `checked` to keep the switch in step. */
  readonly onChange: (checked: boolean) => void
  /** The switch's label, which also names it for screen readers. */
  readonly label: string
  /** Hides the label from view and keeps it for screen readers, for a row that shows its own text. Defaults to false. */
  readonly hideLabel?: boolean
  /** Text under the label. Omit it for none. */
  readonly description?: string
  /** The switch cannot be flipped. Defaults to false. */
  readonly disabled?: boolean
}

/** Props of `Ui.TextInput`. */
export interface UiTextInputProps {
  /** The field's text. */
  readonly value: string
  /** Runs with the field's text on every edit. Pass it on to `value` to keep the field in step. */
  readonly onInput: (value: string) => void
  /** The field's accessible name, which screen readers announce; it is not shown. */
  readonly label: string
  /** Text the empty field shows. Omit it for none. */
  readonly placeholder?: string
  /** Runs with the field's text when the user presses Enter, except while an input method composes text. */
  readonly onSubmit?: (value: string) => void
  /**
   * What the field holds. Defaults to `text`.
   * - `text`: plain text.
   * - `password`: hidden text.
   * - `search`: a search query.
   * - `url`: a web address.
   */
  readonly type?: 'text' | 'password' | 'search' | 'url'
  /**
   * The field's height. Defaults to `normal`.
   * - `normal`: 28px.
   * - `large`: 32px, as in dialogs.
   */
  readonly size?: 'normal' | 'large'
  /** The field cannot be edited. Defaults to false. */
  readonly disabled?: boolean
  /** Shows the field as invalid and reports `aria-invalid`. Defaults to false. */
  readonly invalid?: boolean
  /** Takes focus when its dialog opens. Defaults to false. */
  readonly autofocus?: boolean
  /** Classes of the field, for layout. The app's styles give it its look. */
  readonly class?: string
}

/** Props of `Ui.Keybind`. */
export interface UiKeybindProps {
  /** The keys, one chip each, as `Keybinds.keybind` and `Keybinds.keys` return them. Empty shows nothing. */
  readonly keys: readonly string[]
  /** Classes of the chips' row, for layout. */
  readonly class?: string
}

/** Props of `Ui.Markdown`. */
export interface UiMarkdownProps {
  /** The Markdown source. */
  readonly text: string
  /** Classes of the rendered block, such as a text size. */
  readonly class?: string
}

/** Props of `Ui.Code`. */
export interface UiCodeProps {
  /** The code, shown as it is. */
  readonly content: string
  /**
   * The language to highlight, by a highlighter id or a common alias (`ts`, `tsx`, `py`, `json`, `bash`). A language
   * the app cannot highlight shows plain text; `mermaid` draws the diagram, as the timeline does. Defaults to plain
   * text.
   */
  readonly language?: string
  /** Classes of the code block, for layout. */
  readonly class?: string
}

/** One choice in `UiSelectProps.options`. */
export interface UiSelectOption<T extends string = string> {
  /** The value `onChange` receives. Unique among the options. */
  readonly value: T
  /** The choice's text, in the list and on the closed select. */
  readonly label: string
}

/** Props of `Ui.Select`. */
export interface UiSelectProps<T extends string = string> {
  /** The choices, in order. */
  readonly options: readonly UiSelectOption<T>[]
  /** The selected choice's value. Undefined, or a value no option has, shows `placeholder`. */
  readonly value: T | undefined
  /**
   * Runs with the value the user picks. Pass it on to `value` to keep the select in step. Picking the selected choice
   * again does not call it.
   */
  readonly onChange: (value: T) => void
  /** The select's accessible name, which screen readers announce; it is not shown. */
  readonly label: string
  /** Text the select shows while no choice is selected. Omit it for none. */
  readonly placeholder?: string
  /** The select cannot be opened. Defaults to false. */
  readonly disabled?: boolean
  /** Shows the select as invalid. Defaults to false. */
  readonly invalid?: boolean
  /**
   * Where the list opens from the select. Defaults to `bottom-end`, as the app's settings rows open theirs; it flips
   * when there is no room.
   */
  readonly placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  /** Classes of the select, for layout. The app's styles give it its look. */
  readonly class?: string
}

/** Props of `Ui.SettingsLayout`. */
export interface UiSettingsLayoutProps {
  /** The page's title, at the top of the page, usually the `SettingsPage.title`. */
  readonly title: string
  /** Text under the title. Omit it for none. */
  readonly description?: string
  /** Controls at the end of the title row, such as a `Ui.Button` that opens a website. Omit it for none. */
  readonly actions?: JSX.Element
  /** The page's sections, usually `Ui.SettingsSection`s. */
  readonly children: JSX.Element
}

/** Props of `Ui.SettingsSection`. */
export interface UiSettingsSectionProps {
  /** The section's heading, which also names it for screen readers. Omit it for a section without a heading. */
  readonly title?: string
  /** The section's rows, usually `Ui.SettingsRow`s, in the app's bordered list. */
  readonly children: JSX.Element
  /** Content under the list, outside its border, such as an error that concerns the rows. Omit it for none. */
  readonly footer?: JSX.Element
}

/** Props of `Ui.SettingsRow`. */
export interface UiSettingsRowProps {
  /** The setting's name. */
  readonly title: JSX.Element
  /** Text under the title that says what the setting does. Omit it for none. */
  readonly description?: JSX.Element
  /**
   * The `SettingEntry.id` that reveals this row: when the user picks the entry in settings search, the host scrolls
   * to the row and highlights it. Omit it for a row that search does not list.
   */
  readonly id?: string
  /** The row's control at its end, such as a `Ui.Switch`, `Ui.Select` or `Ui.Button`. Omit it for none. */
  readonly children?: JSX.Element
}

/**
 * The app's own components, so a plugin's UI looks and behaves like the app's: the same buttons, menus, dialogs and
 * fields, in the user's skin and fonts. Each takes a small set of props the SDK keeps stable. A component renders with
 * the context of the plugin that renders it, and works in any of its contributions and dialogs.
 */
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
