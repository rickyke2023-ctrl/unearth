import { useEffect, useRef } from 'react'
import type { Decision } from '../types'

interface Handlers {
  onKeep: () => void
  onLeave: () => void
  onSkip: () => void
  onUndo: () => void
  onStar: () => void
  onLightbox: () => void
  onBack: () => void
  disabled?: boolean
}

export function useKeyboardDecision({
  onKeep, onLeave, onSkip, onUndo, onStar, onLightbox, onBack, disabled,
}: Handlers) {
  const inFlight = useRef(false)

  useEffect(() => {
    if (disabled) return
    const handler = async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (inFlight.current) return

      const key = e.key.toLowerCase()
      if (key === 'arrowright' || key === 'k') { e.preventDefault(); inFlight.current = true; await onKeep(); inFlight.current = false }
      else if (key === 'arrowleft' || key === 'd') { e.preventDefault(); inFlight.current = true; await onLeave(); inFlight.current = false }
      else if (key === 'arrowup' || key === 's') { e.preventDefault(); inFlight.current = true; await onSkip(); inFlight.current = false }
      else if (key === 'z' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); inFlight.current = true; await onUndo(); inFlight.current = false }
      else if (key === 'f' || key === '*') { e.preventDefault(); onStar() }
      else if (key === ' ') { e.preventDefault(); onLightbox() }
      else if (key === 'escape') { e.preventDefault(); onBack() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [disabled, onKeep, onLeave, onSkip, onUndo, onStar, onLightbox, onBack])
}

export type { Decision }
