// Join truthy class names into one string (tailwind-friendly).
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
