import { SectionTabs } from '../../_ui/section-tabs'

/** Section tab bar above every page of this section (see `_ui/nav.ts`). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs section="itineraries" />
      {children}
    </>
  )
}
