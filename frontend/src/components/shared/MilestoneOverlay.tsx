import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '../../hooks/useTranslation'

interface MilestoneOverlayProps {
  message: string | null
  onDismiss: () => void
}

export function MilestoneOverlay({ message, onDismiss }: MilestoneOverlayProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onDismiss, 3000)
    const handleKey = () => onDismiss()
    window.addEventListener('keydown', handleKey, { once: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKey)
    }
  }, [message, onDismiss])

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key={message}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
          style={{ background: 'rgba(10,10,15,0.78)', backdropFilter: 'blur(6px)' }}
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.9, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: -6, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0, 0, 1] }}
            className="text-center px-10 py-8 select-none"
          >
            <p
              className="font-serif tracking-widest"
              style={{ color: 'rgba(255,255,255,0.88)', fontSize: 'var(--text-display)', fontWeight: 400, lineHeight: 1.4, letterSpacing: '0.06em' }}
            >
              {message}
            </p>
            <p
              className="mt-4 text-xs tracking-widest"
              style={{ color: 'rgba(255,255,255,0.22)' }}
            >
              {t('milestone.continue')}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
