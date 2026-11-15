import type {ComponentType} from 'react'

const shadeFills = {
  R: '#D7263D',
  D: '#A4133C',
  C: '#F3EEE4',
  K: '#15161A',
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
  PixelPlay: pixelIcon([
    '................',
    '..OOOOOOOOOOOO..',
    '.ORRRRRRRRRRRDO.',
    'ORRRRRRRRRRRRRDO',
    'ORRRCCRRRRRRRRDO',
    'ORRRCCCCRRRRRRDO',
    'ORRRCCCCCCRRRRDO',
    'ORRRCCCCCCCCRRDO',
    'ORRRCCCCCCCCRRDO',
    'ORRRCCCCCCRRRRDO',
    'ORRRCCCCRRRRRRDO',
    'ORRRCCRRRRRRRRDO',
    'ODRRRRRRRRRRRRDO',
    '.ODDDDDDDDDDDDO.',
    '..OOOOOOOOOOOO..',
    '................',
  ]),
  PixelPlug: pixelIcon([
    '....OO....OO....',
    '...OCCO..OCCO...',
    '...OCCO..OCCO...',
    '..OOCCOOOOCCOO..',
    '.ORRRRRRRRRRRDO.',
    '.ORCRRRRRRRRRDO.',
    '.ORRRRRRRRRRRDO.',
    '.ORRRRRRRRRRRDO.',
    '.ORRRRRRRRRRRDO.',
    '.ODRRRRRRRRRRDO.',
    '..ODDDDRRDDDDO..',
    '...OOOORDOOOO...',
    '......ORDO......',
    '......ODDO......',
    '.......OO.......',
    '................',
  ]),
  PixelRobot: pixelIcon([
    '................',
    '..........O.....',
    '.........ORO....',
    '...OOOOOOOROO...',
    '..ORRRRRRRRRDO..',
    '.ORRRRRRRRRRRDO.',
    '.ORCRRRRRRRRRDO.',
    'ORRRCCRRRRCCRRDO',
    'ODRRCCRRRRCCRRDO',
    '.ORRRRRRRRRRRDO.',
    '.ODRRRRRRRRRRDO.',
    '..ORRDDDDDDDDO..',
    '..ORDOOOOOOOO...',
    '..ODO...........',
    '...O............',
    '................',
  ]),
  PixelCartridge: pixelIcon([
    '................',
    '..OOOOOOOOOO....',
    '.ORRRRRRRRRDO...',
    '.ORRRRRRRRRRDO..',
    '.ORRRRRRRRRRRDO.',
    '.ORRKKKKKKKKRDO.',
    '.ORRKCCCCCCKRDO.',
    '.ORRKCCCCCCKRDO.',
    '.ORRKCCCCCCKRDO.',
    '.ORRKKKKKKKKRDO.',
    '.ORRRRRRRRRRRDO.',
    '.ORRRRRRRRRRRDO.',
    '.ORKRKRKRKRKRDO.',
    '.ODDDDDDDDDDDDO.',
    '..OOOOOOOOOOOO..',
    '................',
  ]),
  PixelWrench: pixelIcon([
    '........OO......',
    '.......ORDO.....',
    '......ORRDO.OO..',
    '......ORDO.ORDO.',
    '......ODRDORRDO.',
    '.......ORRRRRDO.',
    '......ORRRDDDO..',
    '.....ORRDDOOO...',
    '....ORRDOO......',
    '...ORRDO........',
    '..ORRDO.........',
    '.ORRDO..........',
    'ORRDO...........',
    'ODDO............',
    '.OO.............',
    '................',
  ]),
  PixelPage: pixelIcon([
    '..OOOOOOO.......',
    '.ORRRRRRDO......',
    '.ORRRRRRRCO.....',
    '.ORRRRRRRCCO....',
    '.ORRRRRRRCCCO...',
    '.ORRRRRRRKKKKO..',
    '.ORRRRRRRRRRDO..',
    '.ORRCCCCCCCRDO..',
    '.ORRRRRRRRRRDO..',
    '.ORRCCCCCCCRDO..',
    '.ORRRRRRRRRRDO..',
    '.ORRCCCCCRRRDO..',
    '.ORRRRRRRRRRDO..',
    '.ODDDDDDDDDDDO..',
    '..OOOOOOOOOOO...',
    '................',
  ]),
}
