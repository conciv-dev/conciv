export type SchemePair = {light: string; dark: string}

export const SKIN_SCHEME_ANCHORS = [
  'chat-panel',
  'chat-glass',
  'chat-sunken',
  'chat-ground',
  'chat-backdrop',
  'chat-text',
  'chat-text-hi',
  'chat-text-2',
  'chat-text-3',
  'chat-fill',
  'chat-fill-soft',
  'chat-fill-strong',
  'chat-line',
  'chat-line-soft',
  'chat-line-2',
  'chat-accent',
  'chat-on-accent',
  'chat-danger',
  'chat-success',
  'chat-warn',
  'chat-dim',
  'chat-shadow-sm',
  'chat-shadow-lg',
] as const

export const SKIN_SCALAR_ANCHORS = [
  'chat-font',
  'chat-font-display',
  'chat-mono',
  'chat-radius-sm',
  'chat-radius-md',
  'chat-radius-lg',
  'chat-radius-chip',
  'chat-radius-pill',
  'chat-radius-surface-sm',
  'chat-radius-surface-md',
  'chat-radius-surface-lg',
  'chat-ease',
  'chat-ease-expo',
  'chat-space',
] as const

export type SkinSchemeAnchorName = (typeof SKIN_SCHEME_ANCHORS)[number]
export type SkinScalarAnchorName = (typeof SKIN_SCALAR_ANCHORS)[number]
export type SkinAnchorName = SkinSchemeAnchorName | SkinScalarAnchorName

export type SkinColorPairs = Record<SkinSchemeAnchorName, SchemePair>
export type SkinScalars = Record<SkinScalarAnchorName, string>

export type Skin = {
  name: string
  label: string
  description: string
  pairs: SkinColorPairs
  scalars: SkinScalars
}

export const SKIN_ANCHOR_GROUPS = [
  'surfaces',
  'ink',
  'overlays',
  'accent',
  'status',
  'shadows',
  'type',
  'radii',
  'motion',
  'density',
] as const

export type SkinAnchorGroup = (typeof SKIN_ANCHOR_GROUPS)[number]

export type AnchorDoc = {group: SkinAnchorGroup; description: string}

export type TokenDefinition = {value: string; description: string}

export const SKIN_ANCHOR_DOCS: Record<SkinAnchorName, AnchorDoc> = {
  'chat-panel': {group: 'surfaces', description: 'Opaque panel body. The widget reads as this colour.'},
  'chat-glass': {group: 'surfaces', description: 'Translucent floating surface (menus, popovers, dialogs).'},
  'chat-sunken': {group: 'surfaces', description: 'Recessed surface for code blocks and read-only fields.'},
  'chat-ground': {group: 'surfaces', description: 'Deepest ground behind the panel body.'},
  'chat-backdrop': {group: 'surfaces', description: 'Modal scrim. Dark in both schemes by convention.'},
  'chat-text': {group: 'ink', description: 'Primary body ink.'},
  'chat-text-hi': {group: 'ink', description: 'Emphasis ink for headings and strong text.'},
  'chat-text-2': {group: 'ink', description: 'Secondary ink for labels and muted prose.'},
  'chat-text-3': {group: 'ink', description: 'Faint ink for metadata and timestamps.'},
  'chat-fill': {group: 'overlays', description: 'Neutral fill layered over the panel.'},
  'chat-fill-soft': {group: 'overlays', description: 'Lightest neutral fill.'},
  'chat-fill-strong': {group: 'overlays', description: 'Strongest neutral fill, used for hover and active.'},
  'chat-line': {group: 'overlays', description: 'Default hairline.'},
  'chat-line-soft': {group: 'overlays', description: 'Quietest hairline, for internal dividers.'},
  'chat-line-2': {group: 'overlays', description: 'Emphasised hairline, for focused and outer edges.'},
  'chat-accent': {group: 'accent', description: 'Brand accent. Drives links, focus rings and primary fills.'},
  'chat-on-accent': {group: 'accent', description: 'Ink placed on an accent fill.'},
  'chat-danger': {group: 'status', description: 'Error ink and error borders.'},
  'chat-success': {group: 'status', description: 'Success ink and success borders.'},
  'chat-warn': {group: 'status', description: 'Warning ink and warning borders.'},
  'chat-dim': {group: 'status', description: 'Base colour of the pending and thinking shimmer.'},
  'chat-shadow-sm': {group: 'shadows', description: 'Tight elevation for small controls.'},
  'chat-shadow-lg': {group: 'shadows', description: 'Wide elevation for floating surfaces.'},
  'chat-font': {group: 'type', description: 'Body font stack.'},
  'chat-font-display': {group: 'type', description: 'Display font stack for titles and rails.'},
  'chat-mono': {group: 'type', description: 'Monospace font stack for code, paths and terminals.'},
  'chat-radius-sm': {group: 'radii', description: 'Inline control radius, smallest step.'},
  'chat-radius-md': {group: 'radii', description: 'Inline control radius, default step.'},
  'chat-radius-lg': {group: 'radii', description: 'Inline control radius, largest step.'},
  'chat-radius-chip': {group: 'radii', description: 'Chip and tag radius.'},
  'chat-radius-pill': {group: 'radii', description: 'Fully rounded radius for pills and avatars.'},
  'chat-radius-surface-sm': {group: 'radii', description: 'Floating surface radius, smallest step.'},
  'chat-radius-surface-md': {group: 'radii', description: 'Floating surface radius, default step.'},
  'chat-radius-surface-lg': {group: 'radii', description: 'Floating surface radius, largest step.'},
  'chat-ease': {group: 'motion', description: 'Default easing curve for state changes.'},
  'chat-ease-expo': {group: 'motion', description: 'Decisive easing curve for entrances and exits.'},
  'chat-space': {
    group: 'density',
    description:
      'Spacing base unit of the conversation surfaces (thread and composer). Stay within roughly 8% of 0.25rem; text sizes ride the font scale and do not shrink with it.',
  },
}

export const SKIN_CLASS_PREFIX = 'chat-skin-'

export function skinClassName(name: string): string {
  return `${SKIN_CLASS_PREFIX}${name}`
}

export function schemePairValue(pair: SchemePair): string {
  return `light-dark(${pair.light}, ${pair.dark})`
}

export function anchorEntries(skin: Skin): [SkinAnchorName, string][] {
  const pairs = SKIN_SCHEME_ANCHORS.map((name): [SkinAnchorName, string] => [name, schemePairValue(skin.pairs[name])])
  const scalars = SKIN_SCALAR_ANCHORS.map((name): [SkinAnchorName, string] => [name, skin.scalars[name]])
  return [...pairs, ...scalars]
}

export function anchorTokenDefinitions(skin: Skin): Record<string, TokenDefinition> {
  const entries = anchorEntries(skin).map(([name, value]): [string, TokenDefinition] => [
    name,
    {value, description: SKIN_ANCHOR_DOCS[name].description},
  ])
  return Object.fromEntries(entries)
}

export function declarationBlock(entries: [string, string][]): string {
  return entries.map(([name, value]) => `  --${name}: ${value};`).join('\n')
}

export function renderSkinCss(skin: Skin): string {
  const selector = skinClassName(skin.name)
  return `:host(.${selector}),\n.${selector} {\n${declarationBlock(anchorEntries(skin))}\n}\n`
}
