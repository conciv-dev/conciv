export function figmaRef(link: string): string | null {
  if (!URL.canParse(link)) return null
  const url = new URL(link)
  const fileKey = url.pathname.split('/').filter(Boolean)[1]
  const nodeId = url.searchParams.get('node-id')?.replaceAll('-', ':')
  return fileKey === undefined || nodeId === undefined ? null : `${fileKey}/${nodeId}`
}
