export type MascotPartName = 'head' | 'eyes' | 'antenna'

const PART_COMPONENTS: Record<MascotPartName, string> = {
  head: '<Mascot.Head>',
  eyes: '<Mascot.Eyes>',
  antenna: '<Mascot.Antenna>',
}

export const partAlreadyProvided = (part: MascotPartName): Error =>
  new Error(`mascot part '${part}' is already provided; render exactly one ${PART_COMPONENTS[part]}`)
