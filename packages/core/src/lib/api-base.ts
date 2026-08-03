export function apiBaseFrom(requestUrl: string, basePath: string): string {
  return `${new URL(requestUrl).origin}${basePath}`
}
