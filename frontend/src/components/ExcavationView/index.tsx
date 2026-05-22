import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getExcavationToday, postDecisions, previewUrl } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { ScrubReveal } from '../shared/ScrubReveal'
import type { ScrubRevealHandle } from '../shared/ScrubReveal'
import { CameraGestureController } from '../shared/CameraGestureController'
import { strataColorForYear } from '../../utils'
import { formatDateShort } from '../../i18n'
import type { Photo } from '../../types'

// ── Completion screen ──────────────────────────────────────────────────────

function DoneState({
  kept, left, total, onBack,
}: {
  kept: number; left: number; total: number; onBack: () => void
}) {
  const { t, lang } = useTranslation()
  const dateStr = new Date().toLocaleDateString(
    lang === 'en' ? 'en-US' : 'zh-CN',
    { year: 'numeric', month: 'long', day: 'numeric' }
  )
  const poemLines = t('excav.done.poem').split('\n')

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-full gap-6 text-center"
      style={{ padding: '0 40px' }}
    >
      <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
        <p
          className="font-serif tracking-widest"
          style={{ color: 'var(--strata-2022)', fontSize: 'var(--text-display)', fontWeight: 400 }}
        >
          {t('excav.done.title')}
        </p>
        <p className="mt-2 text-xs tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
          {dateStr}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex gap-8 text-sm"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <div className="flex flex-col items-center gap-1">
          <span style={{ color: 'var(--color-keep)', fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{kept}</span>
          <span className="text-xs">{t('excav.done.kept')}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span style={{ color: 'var(--color-leave)', fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{left}</span>
          <span className="text-xs">{t('excav.done.left')}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{total}</span>
          <span className="text-xs">{t('excav.done.total')}</span>
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-xs"
        style={{ color: 'var(--color-text-muted)', maxWidth: 280, lineHeight: 1.7 }}
      >
        {poemLines[0]}<br />{poemLines[1]}
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        onClick={onBack}
        className="px-6 py-2.5 rounded-lg text-sm tracking-wider transition-opacity hover:opacity-70"
        style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}
      >
        {t('excav.done.back')}
      </motion.button>
    </motion.div>
  )
}

// ── Decision buttons (appear after scrub) ─────────────────────────────────

function RevealedActions({
  photo, onDecide,
}: {
  photo: Photo
  onDecide: (d: 'keep' | 'leave') => void
}) {
  const { t, lang } = useTranslation()
  const [keepActive, setKeepActive] = useState(false)
  const [leaveActive, setLeaveActive] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 pb-6"
      style={{ zIndex: 20 }}
    >
      {/* 照片元信息 */}
      <p className="text-xs tracking-wider" style={{ color: 'rgba(255,255,255,0.38)' }}>
        {photo.shot_at ? formatDateShort(photo.shot_at, lang) : photo.file_name}
        {photo.gps_city ? `  ·  ${photo.gps_city}` : ''}
      </p>

      <div className="flex gap-4">
        <motion.button
          animate={leaveActive ? { y: 4, scale: 0.97 } : { y: 0, scale: 1 }}
          transition={{ duration: 0.15 }}
          onClick={() => { setLeaveActive(true); setTimeout(() => setLeaveActive(false), 400); onDecide('leave') }}
          className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm tracking-wider"
          style={{ background: 'rgba(139,115,85,0.22)', border: '1px solid var(--color-leave)', color: 'var(--color-leave)' }}
        >
          ← {leaveActive ? t('btn.leave.active') : t('btn.leave')}
          <kbd style={{ fontSize: 9, opacity: 0.35, padding: '1px 4px', borderRadius: 3, border: '1px solid currentColor', fontFamily: 'monospace' }}>D</kbd>
        </motion.button>

        <motion.button
          animate={keepActive ? { y: -4, scale: 1.03 } : { y: 0, scale: 1 }}
          transition={{ duration: 0.15 }}
          onClick={() => { setKeepActive(true); setTimeout(() => setKeepActive(false), 400); onDecide('keep') }}
          className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm tracking-wider"
          style={{ background: 'rgba(126,184,164,0.22)', border: '1px solid var(--color-keep)', color: 'var(--color-keep)' }}
        >
          {keepActive ? t('btn.keep.active') : t('btn.keep')} →
          <kbd style={{ fontSize: 9, opacity: 0.35, padding: '1px 4px', borderRadius: 3, border: '1px solid currentColor', fontFamily: 'monospace' }}>K</kbd>
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Main ExcavationView ────────────────────────────────────────────────────

export function ExcavationView() {
  const { setView } = useAppStore()
  const { t } = useTranslation()

  const [photos, setPhotos] = useState<Photo[]>([])
  const [dateLabel, setDateLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [kept, setKept] = useState(0)
  const [left, setLeft] = useState(0)
  const [done, setDone] = useState(false)

  const scrubRef = useRef<ScrubRevealHandle>(null)

  const handleGesture = useCallback((nx: number, ny: number) => {
    scrubRef.current?.scrubAt(nx, ny)
  }, [])

  useEffect(() => {
    getExcavationToday(20)
      .then((res) => {
        setPhotos(res.photos)
        setDateLabel(res.date_label)
      })
      .catch((e) => setError(e.message ?? t('excav.error')))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Preload next 2 photos so transitions feel instant
  useEffect(() => {
    [index + 1, index + 2].forEach((i) => {
      const photo = photos[i]
      if (photo) {
        const img = new Image()
        img.src = previewUrl(photo.id)
      }
    })
  }, [index, photos])

  useEffect(() => {
    if (!revealed || done) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' || e.key === 'K') decide('keep')
      if (e.key === 'd' || e.key === 'D') decide('leave')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [revealed, done, index]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentPhoto = photos[index] ?? null

  const handleRevealed = useCallback(() => {
    setRevealed(true)
  }, [])

  const decide = useCallback(async (decision: 'keep' | 'leave') => {
    const photo = photos[index]
    if (!photo) return
    setRevealed(false)

    if (decision === 'keep') setKept((k) => k + 1)
    else setLeft((l) => l + 1)

    try {
      await postDecisions([{ photo_id: photo.id, decision }])
    } catch {}

    const next = index + 1
    if (next >= photos.length) {
      setDone(true)
    } else {
      setIndex(next)
    }
  }, [photos, index])

  const yearColor = currentPhoto ? strataColorForYear(currentPhoto.year) : 'var(--strata-2022)'

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: '#0a0a0f' }}>
        <motion.div
          className="w-8 h-8 rounded-full border-2"
          style={{ borderColor: 'rgba(255,180,80,0.4)', borderTopColor: 'transparent' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    )
  }

  if (error || photos.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ background: '#0a0a0f' }}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          {error || t('excav.empty')}
        </p>
        <button
          onClick={() => setView('strata')}
          className="text-xs px-4 py-2 rounded transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-glass-border)' }}
        >
          {t('excav.back')}
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden" style={{ background: '#0a0a0f' }}>

      {/* Background */}
      <AnimatePresence mode="sync">
        {currentPhoto && !done && (
          <motion.div
            key={currentPhoto.id}
            className="absolute inset-0 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <img
              src={previewUrl(currentPhoto.id)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'blur(48px) brightness(0.1) saturate(0.5)', transform: 'scale(1.12)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 flex-shrink-0">
        <button
          onClick={() => setView('strata')}
          className="text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {t('excav.back')}
        </button>

        <div className="flex flex-col items-center">
          <p
            className="font-serif tracking-widest text-xs"
            style={{ color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}
          >
            {t('excav.header')}
          </p>
          <p className="text-xs" style={{ color: yearColor, marginTop: 2 }}>
            {dateLabel}
          </p>
        </div>

        {!done && (
          <p
            className="text-xs font-tabular"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {index + 1} <span style={{ opacity: 0.4 }}>/ {photos.length}</span>
          </p>
        )}
        {done && <div style={{ width: 40 }} />}
      </div>

      {/* Progress bar */}
      {!done && (
        <div className="relative z-10 flex-shrink-0 px-6" style={{ marginTop: -6 }}>
          <div className="h-px w-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <motion.div
              className="h-px"
              style={{ background: yearColor, opacity: 0.5 }}
              animate={{ width: `${((index) / photos.length) * 100}%` }}
              transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
            />
          </div>
        </div>
      )}

      {/* Camera gesture overlay — ✋ button fixed to bottom-right */}
      <CameraGestureController onGesture={handleGesture} />

      {/* Main area */}
      <div className="relative z-10 flex-1" style={{ minHeight: 0 }}>
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0"
            >
              <DoneState
                kept={kept} left={left} total={photos.length}
                onBack={() => setView('strata')}
              />
            </motion.div>
          ) : currentPhoto ? (
            <motion.div
              key={currentPhoto.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0"
            >
              <ScrubReveal
                ref={scrubRef}
                src={previewUrl(currentPhoto.id)}
                alt={currentPhoto.file_name}
                onRevealed={handleRevealed}
              />

              <AnimatePresence>
                {revealed && (
                  <RevealedActions photo={currentPhoto} onDecide={decide} />
                )}
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

    </div>
  )
}
