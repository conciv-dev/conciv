import type {StoreDeclaration} from './core.js'

export type Stores = Readonly<Record<string, StoreDeclaration>>

export type Icons = Readonly<Record<string, string>>

export interface Declarations<S extends Stores = Stores, I extends Icons = Icons> {
  readonly stores?: S
  /**
   * The plugin's own icons, by name, for artwork the app's icon catalog does not have. Each value is an SVG document
   * as text, as a design tool exports it; a bundle built with `gui()` imports the file with `?raw`. The host registers
   * them before setup, and `ctx.icons` gives each one's name for every SDK icon field and for `ctx.ui.Icon`. A value
   * that is not an SVG document fails the plugin when it starts.
   * - The document's `viewBox` frames the drawing, else its `width` and `height`. The host scales the drawing to the
   *   place that shows it, so draw on the app's 16px grid.
   * - Draw with `currentColor`: the icon takes the color of the place that shows it, such as a pill's `tone`.
   * - A drawing may move with SVG animation elements (`animate`, `animateTransform`). Every place that shows the icon
   *   moves in step, and the animation goes on while the host renders that place again. Under the user's reduced
   *   motion setting the host holds the icon on its first frame, so make that frame the resting drawing.
   * - An `id` in the drawing is the whole window's; keep it unique, or leave it out.
   *
   * @example
   * ```ts
   * import logo from "./logo.svg?raw"
   *
   * export default Plugin.define({ icons: { logo }, setup })
   * ```
   */
  readonly icons?: I
}
