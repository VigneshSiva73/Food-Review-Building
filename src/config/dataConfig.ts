/** Rules governing dataset parsing, validation, and cleaning. */

export type ConflictStrategy = 'first' | 'last' | 'average'

export const dataConfig = Object.freeze({
  /** Rating scale bounds; out-of-range values are clamped and reported. */
  ratingMin: 1,
  ratingMax: 5,
  /** Source dates are DD/MM/YYYY (04/06/2026 = 4 June 2026). */
  dateFormat: 'DD/MM/YYYY',
  /** How to resolve duplicate (date, meal) keys with differing values. */
  conflictStrategy: 'first' as ConflictStrategy,
  /** Runtime CSV location (relative to the site base). */
  csvUrl: 'data/food-reviews.csv',
  /** Expected CSV headers after normalization (lowercased, single-spaced). */
  headers: Object.freeze({
    date: 'date',
    mealType: 'meal type',
    rating: 'average rating',
    vendor: 'vendor name',
    /**
     * Attendance, and all three are OPTIONAL columns.
     *
     * A file that predates them is still a valid file — it simply records no
     * attendance — so their absence is not an error and the panel says so
     * rather than reporting zero people. A value that is PRESENT and wrong is
     * a different matter and is reported like any other bad cell.
     */
    count: 'people count',
    consumed: 'consumed',
    reviewed: 'reviewed',
  }),

  /**
   * How many people a sitting can hold.
   *
   * The office does not double in size overnight, so a count outside this is a
   * data fault rather than a busy day, and is clamped like an out-of-range
   * rating. Consumed and reviewed are bounded by what precedes them instead —
   * you cannot eat a meal nobody served or review one you did not eat.
   */
  attendance: Object.freeze({ min: 60, max: 150 }),
})

export type DataConfig = typeof dataConfig
