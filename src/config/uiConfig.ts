/** UI layout constants (plan §30–31). Breakpoints match Tailwind defaults. */

export const uiConfig = Object.freeze({
  breakpoints: Object.freeze({
    /** ≥1280: docked side panel. */
    desktop: 1280,
    /** 768–1279: slide-over sheet. */
    tablet: 768,
  }),
  sidePanelWidthPx: 360,
  mobile: Object.freeze({
    /** Bottom-sheet snap points as viewport-height fractions. */
    sheetPeekFraction: 0.18,
    sheetHalfFraction: 0.5,
    sheetFullFraction: 0.9,
    dprCap: 1.5,
  }),
  appTitle: 'Food Review Building',
})

export type UiConfig = typeof uiConfig
