import type * as PageTree from 'fumadocs-core/page-tree'
import {SidebarSeparator} from 'fumadocs-ui/components/sidebar/base'

export function DocsSidebarSeparator({item}: {item: PageTree.Separator}) {
  if (!item.name) {
    return (
      <SidebarSeparator role="separator" className="px-2 py-3">
        <span className="block h-px bg-fd-border" />
      </SidebarSeparator>
    )
  }
  return (
    <SidebarSeparator className="px-2 pt-6 pb-1.5 text-sm font-semibold text-fd-foreground first:pt-0">
      {item.name}
    </SidebarSeparator>
  )
}
