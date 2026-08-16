const LAYER_GEOMETRY_PROPERTIES = [
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'background',
  'background-image',
  'background-repeat',
  'background-size',
]

const LAYER_GEOMETRY_PREFIXES = ['inset', 'background-position']

const CUSTOM_PROPERTY_PREFIX = '--'

export const isGeometryProperty = (property: string): boolean =>
  LAYER_GEOMETRY_PROPERTIES.includes(property) ||
  LAYER_GEOMETRY_PREFIXES.some((prefix) => property === prefix || property.startsWith(`${prefix}-`))

export const kebabCaseProperty = (property: string): string =>
  property.startsWith(CUSTOM_PROPERTY_PREFIX)
    ? property
    : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

export const camelCaseProperty = (property: string): string =>
  property.startsWith(CUSTOM_PROPERTY_PREFIX)
    ? property
    : property.replace(/-[a-z]/g, (dashed) => dashed.slice(1).toUpperCase())
