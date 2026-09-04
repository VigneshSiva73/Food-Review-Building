import { useEffect } from 'react'
import { useSelectionStore } from '@/state/useSelectionStore'
import { useViewStore } from '@/state/useViewStore'

/**
 * Selecting anything flies the camera to it — whether the click landed on the
 * building, on a panel row, on a "best day" link, or came from the arrow keys.
 * Clearing the selection deliberately leaves the camera where it is.
 */
export function useAutoFocus() {
  const selected = useSelectionStore((s) => s.selected)

  useEffect(() => {
    if (selected) useViewStore.getState().requestFocus(selected)
  }, [selected])
}
