import type { ReactNode } from 'react'
import { AppearanceSection } from './AppearanceSection'
import { ContentSection } from './ContentSection'
import { EffectsSection } from './EffectsSection'
import { FillSection } from './FillSection'
import { InputSection } from './InputSection'
import { LayoutSection } from './LayoutSection'
import { PositionSection } from './PositionSection'
import { SidebarHeader } from './SidebarHeader'
import { SourceSection } from './SourceSection'
import { StrokeSection } from './StrokeSection'
import { TextColorSection } from './TextColorSection'
import { TypographySection } from './TypographySection'
import { sectionsForTag } from './section-visibility'

/**
 * DesignPanel — the Figma-style properties column.
 * Used as the body of the "Design" sidebar tab.
 *
 * The set of visible sections depends on the selected element's tag (see
 * section-visibility.ts). E.g. <div> hides Typography; <img> shows Source.
 *
 * Sections take `elements: Element[]` so they can collapse multi-edit values
 * to a "Multiple" placeholder when the source + peer elements disagree.
 * `selectedElement` is still passed for the section visibility check.
 */

export interface DesignPanelProps {
  banner?: ReactNode
  selectedTag?: string | null
  /** Tag to show in the header — `MIXED_TAG` for a mixed multi-selection.
   *  Falls back to `selectedTag`. Section visibility still uses `selectedTag`. */
  headerTag?: string | null
  selectedElement?: Element | null
  elements?: Element[]
}

export function DesignPanel({
  banner = null,
  selectedTag = null,
  headerTag = null,
  selectedElement = null,
  elements = [],
}: DesignPanelProps = {}) {
  const visible = selectedTag ? new Set(sectionsForTag(selectedTag)) : new Set<string>()
  return (
    <>
      {banner}
      <SidebarHeader tagName={headerTag ?? selectedTag} />
      <ContentSection elements={elements} />
      {visible.has('position')   && <PositionSection elements={elements} />}
      {visible.has('layout')     && <LayoutSection elements={elements} />}
      {visible.has('appearance') && <AppearanceSection elements={elements} />}
      {visible.has('typography') && <TypographySection elements={elements} />}
      {visible.has('textColor')  && <TextColorSection elements={elements} />}
      {visible.has('source')     && <SourceSection />}
      {visible.has('input')      && <InputSection elements={elements} />}
      {visible.has('fill')       && <FillSection elements={elements} />}
      {visible.has('stroke')     && <StrokeSection elements={elements} />}
      {visible.has('effects')    && <EffectsSection elements={elements} />}
    </>
  )
}
