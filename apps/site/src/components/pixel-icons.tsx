import type {ComponentType} from 'react'

const shadeFills = {
  R: '#D7263D',
  C: '#F3EEE4',
}

function cellsPath(rows: readonly string[], shade: string) {
  return rows
    .flatMap((row, y) => [...row].flatMap((cell, x) => (cell === shade ? [`M${x} ${y}h1v1h-1z`] : [])))
    .join('')
}

function pixelIcon(rows: readonly string[]) {
  const outline = cellsPath(rows, 'O')
  const shades = Object.entries(shadeFills).map(([shade, fill]) => ({fill, path: cellsPath(rows, shade)}))
  return function PixelIcon() {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" shapeRendering="crispEdges" aria-hidden="true">
        <path d={outline} className="fill-[#15161A] dark:fill-[#A4133C]" />
        {shades.map(({fill, path}) => (
          <path key={fill} d={path} fill={fill} />
        ))}
      </svg>
    )
  }
}

export const pixelIcons: Record<string, ComponentType> = {
  PixelPage: pixelIcon([
    '................',
    '..OOOOOOOOOOOO..',
    '.OORRRRRRRRRROO.',
    '.ORRRRRRRRRRRRO.',
    '.ORRRCCCCRRRRRO.',
    '.ORRRCCCCCRRRRO.',
    '.ORRRCCCCCCRRRO.',
    '.ORRRCRRRRCRRRO.',
    '.ORRRCCCCCCRRRO.',
    '.ORRRCRRRRCRRRO.',
    '.ORRRCCCCCCRRRO.',
    '.ORRRCCCCCCRRRO.',
    '.ORRRRRRRRRRRRO.',
    '.OORRRRRRRRRROO.',
    '..OOOOOOOOOOOO..',
    '................',
  ]),
  PixelPlug: pixelIcon([
    '................',
    '..OOOOOOOOOOOO..',
    '.OORRRRRRRRRROO.',
    '.ORRRRRRRRRRRRO.',
    '.ORRRRCRRCRRRRO.',
    '.ORRRRCRRCRRRRO.',
    '.ORRRCCCCCCRRRO.',
    '.ORRRCCCCCCRRRO.',
    '.ORRRCCCCCCRRRO.',
    '.ORRRRCCCCRRRRO.',
    '.ORRRRRCCRRRRRO.',
    '.ORRRRRCCRRRRRO.',
    '.ORRRRRRRRRRRRO.',
    '.OORRRRRRRRRROO.',
    '..OOOOOOOOOOOO..',
    '................',
  ]),
  PixelRobot: pixelIcon([
    '................',
    '..OOOOOOOOOOOO..',
    '.OORRRRRRRRRROO.',
    '.ORRRRRRRRRRRRO.',
    '.ORRRRRCCRRRRRO.',
    '.ORRRCCCCCCRRRO.',
    '.ORRRCRCCRCRRRO.',
    '.ORRRCRCCRCRRRO.',
    '.ORRRCCCCCCRRRO.',
    '.ORRRCCRRCCRRRO.',
    '.ORRRCCCCCCRRRO.',
    '.ORRRCRRRRCRRRO.',
    '.ORRRRRRRRRRRRO.',
    '.OORRRRRRRRRROO.',
    '..OOOOOOOOOOOO..',
    '................',
  ]),
}
