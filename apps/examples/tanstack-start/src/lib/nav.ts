export type NavLink = {to: string; label: string}

export const NAV_LINKS: NavLink[] = [
  {to: '/', label: 'Home'},
  {to: '/about', label: 'About'},
]

// The nav link whose `to` matches the current path, or null.
export function activeLink(pathname: string): NavLink | null {
  return NAV_LINKS.find((l) => l.to === pathname) ?? null
}
