export type FigmaLink = {readonly fileKey: string; readonly nodeId: string}

const FIGMA_HOST = 'figma.com'

export function parseFigmaLink(link: string): FigmaLink | null {
  if (!URL.canParse(link)) return null
  const url = new URL(link)
  if (url.hostname !== FIGMA_HOST && !url.hostname.endsWith(`.${FIGMA_HOST}`)) return null
  const [, kind, key, branch, branchKey] = url.pathname.split('/')
  if ((kind !== 'design' && kind !== 'file') || key === undefined || key === '') return null
  const node = url.searchParams.get('node-id')
  if (node === null || node === '') return null
  const fileKey = branch === 'branch' && branchKey !== undefined && branchKey !== '' ? branchKey : key
  return {fileKey, nodeId: node.replaceAll('-', ':')}
}

export function figmaRef(link: FigmaLink): string {
  return `${link.fileKey}/${link.nodeId}`
}
