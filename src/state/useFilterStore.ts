import { create } from 'zustand'
import type { DailyReview } from '@/types'
import { useSelectionStore } from './useSelectionStore'

interface FilterState {
  /** Selected year; null until the dataset provides one. */
  year: number | null
  /** Calendar month 1–12; null until the dataset provides one. */
  month: number | null
  /** Day-of-month cap for the vertical slider; null = whole month. */
  dayLimit: number | null
  setYear: (year: number) => void
  setMonth: (month: number) => void
  setDayLimit: (dayLimit: number | null) => void
  /** Switch the filter so the given ISO date's floor is displayed. */
  selectMonthForDate: (iso: string) => void
  /** Land on the dataset's most recent month the first time data arrives. */
  initialiseFrom: (days: DailyReview[]) => void
}

/**
 * The slicer filter (plan: Bambu-style month/day slicing).
 *
 * There is no "whole dataset" selection: the tower is always one month. A
 * stacked view of every day would be hundreds of floors tall and unreadable,
 * and comparing months is the entire point of the slider — so year and month
 * together always name exactly one building.
 */
export const useFilterStore = create<FilterState>((set, get) => ({
  year: null,
  month: null,
  dayLimit: null,

  setYear(year) {
    if (get().year === year) return
    // Selection floor indexes refer to the previous building; clear here,
    // synchronously, so a caller may set a fresh selection immediately after
    // switching (the stats links rely on this ordering).
    useSelectionStore.getState().clear()
    set({ year, dayLimit: null })
  },
  // A new month starts un-sliced; keeping an old day cap would silently
  // truncate the fresh building.
  setMonth(month) {
    if (get().month === month) return
    useSelectionStore.getState().clear()
    set({ month, dayLimit: null })
  },
  setDayLimit: (dayLimit) => set({ dayLimit }),

  selectMonthForDate(iso) {
    const year = Number(iso.slice(0, 4))
    const month = Number(iso.slice(5, 7))
    if (get().year !== year || get().month !== month) {
      useSelectionStore.getState().clear()
      set({ year, month, dayLimit: null })
    }
  },

  initialiseFrom(days) {
    // Only ever lands the opening view; a user's own choice is never overwritten.
    if (get().month !== null || days.length === 0) return
    const latest = days[days.length - 1].date // pipeline guarantees chronological
    set({ year: Number(latest.slice(0, 4)), month: Number(latest.slice(5, 7)), dayLimit: null })
  },
}))
