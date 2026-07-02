export type NavLink = {to: string; label: string}

export const NAV_LINKS: NavLink[] = [
  {to: '/', label: 'Home'},
  {to: '/about', label: 'About'},
  {to: '/form', label: 'Form'},
]

export function activeLink(pathname: string): NavLink | null {
  return NAV_LINKS.find((l) => l.to === pathname) ?? null
}
