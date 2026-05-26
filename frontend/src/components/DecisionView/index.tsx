import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getEventPhotos, postDecisions, undoDecision, toggleBookCandidate, previewUrl, getDayPhotoCount } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { useKeyboardDecision } from '../../hooks/useKeyboardDecision'
import { formatBytes, strataColorForYear } from '../../utils'
import { MilestoneOverlay } from '../shared/MilestoneOverlay'
import {
  getMilestone, milestoneKeep, milestoneTotal,
  formatShotAt, formatEventTitle, formatDateShort, simplifyCamera,
} from '../../i18n'
import type { Photo } from '../../types'

// ── Noise texture (SVG feTurbulence as data URL) ───────────────────────────

const NOISE_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.80' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

// ── Memory context helpers ─────────────────────────────────────────────────

const dayCountCache = new Map<string, number>()

function MemoryContextCard({ photo }: { photo: Photo }) {
  const { t, lang } = useTranslation()
  const dateKey = photo.shot_at ? photo.shot_at.slice(0, 10) : null
  const [dayCount, setDayCount] = useState<number | null>(
    dateKey && dayCountCache.has(dateKey) ? dayCountCache.get(dateKey)! : null
  )

  useEffect(() => {
    if (!dateKey) return
    void (async () => {
      if (dayCountCache.has(dateKey)) {
        setDayCount(dayCountCache.get(dateKey)!)
        return
      }
      try {
        const { count } = await getDayPhotoCount(dateKey)
        dayCountCache.set(dateKey, count)
        setDayCount(count)
      } catch { /* suppress */ }
    })()
  }, [dateKey])

  const formattedDate = photo.shot_at ? formatShotAt(photo.shot_at, lang) : null
  const location = photo.gps_city
    ? `${photo.gps_city}${photo.gps_country ? `，${photo.gps_country}` : ''}`
    : photo.gps_country ?? null
  const camera = simplifyCamera(photo.camera_model, lang)

  if (!formattedDate && !location && !camera) return null

  const dayCountLabel = dayCount !== null
    ? (lang === 'en'
        ? `${dayCount} ${t('decision.day.count.unit')}`
        : `${t('decision.day.count')} ${dayCount} ${t('decision.day.count.unit')}`)
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.35, delay: 0.18, ease: [0.25, 0, 0, 1] }}
      className="absolute bottom-5 left-5 z-20 rounded-xl px-3 py-2.5 pointer-events-none"
      style={{
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.09)',
        maxWidth: 260,
      }}
    >
      {formattedDate && (
        <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 1.5, letterSpacing: '0.02em' }}>
          {formattedDate}
        </p>
      )}
      <div className="flex items-center gap-3 mt-1" style={{ fontSize: 13 }}>
        {location && <span style={{ color: 'rgba(255,255,255,0.75)' }}>↟ {location}</span>}
        {camera && <span style={{ color: 'rgba(255,255,255,0.75)' }}>{camera}</span>}
      </div>
      {dayCountLabel && (
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4 }}>
          {dayCountLabel}
        </p>
      )}
    </motion.div>
  )
}

// ── Ripple effect ──────────────────────────────────────────────────────────

function useRipple() {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; color: string }>>([])
  const trigger = useCallback((x: number, y: number, color: string) => {
    const id = Date.now()
    setRipples((r) => [...r, { id, x, y, color }])
    setTimeout(() => setRipples((r) => r.filter((rr) => rr.id !== id)), 700)
  }, [])
  return { ripples, trigger }
}

// ── Photo display — 从黑暗里取出 ──────────────────────────────────────────

type ExitDir = 'down' | 'up' | null

function PhotoDisplay({ photo, exitDir }: { photo: Photo; exitDir: ExitDir }) {
  const { t } = useTranslation()
  const [imgError, setImgError] = useState(false)

  const enterVariants = {
    enter:  { opacity: 0, scale: 0.96, filter: 'brightness(0) blur(8px)', x: 0, y: 0 },
    center: { opacity: 1, scale: 1,    filter: 'brightness(1) blur(0px)', x: 0, y: 0 },
    exitUp: {
      opacity: 0,
      scale: 0.06,
      x: 560,
      y: -220,
      filter: 'brightness(3) blur(1px)',
    },
    exitDown: {
      opacity: 0,
      scale: 0.93,
      x: 0,
      y: 28,
      filter: 'brightness(0.08) blur(6px)',
    },
    exitSkip: {
      opacity: 0,
      scale: 1,
      x: 0,
      y: 0,
      filter: 'brightness(0.3) blur(2px)',
    },
  }

  const exitVariant = exitDir === 'up' ? 'exitUp' : exitDir === 'down' ? 'exitDown' : 'exitSkip'

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={photo.id}
        variants={enterVariants}
        initial="enter"
        animate="center"
        exit={exitVariant}
        transition={{
          duration: exitDir === 'up' ? 0.44 : 0.4,
          ease: exitDir === 'up' ? [0.16, 1, 0.3, 1] : [0.4, 0, 0.2, 1],
        }}
        className="absolute inset-0 flex items-center justify-center"
        style={{ padding: '72px 196px 72px 80px' }}
      >
        <motion.div
          animate={exitDir === 'up'
            ? { boxShadow: '0 0 60px 18px rgba(126,184,164,0.45), 0 28px 80px rgba(0,0,0,0.65)' }
            : { boxShadow: '0 28px 80px rgba(0,0,0,0.72), 0 6px 24px rgba(0,0,0,0.55)' }}
          transition={{ duration: 0.14 }}
          style={{
            borderRadius: 4,
            overflow: 'hidden',
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {imgError ? (
            <div
              className="flex flex-col items-center justify-center gap-3"
              style={{
                width: 320, height: 240,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
              }}
            >
              <span style={{ fontSize: 28, opacity: 0.15 }}>⬛</span>
              <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 11, letterSpacing: '0.04em', textAlign: 'center', maxWidth: 220 }}>
                {photo.file_name}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.14)', fontSize: 10 }}>{t('decision.preview.gen')}</p>
            </div>
          ) : (
            <img
              src={previewUrl(photo.id)}
              alt={photo.file_name}
              onError={() => setImgError(true)}
              style={{
                maxWidth: '100%',
                maxHeight: 'calc(100vh - 310px)',
                objectFit: 'contain',
                display: 'block',
              }}
              draggable={false}
            />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Strata Queue — 右侧叠放，待取的岩层 ──────────────────────────────────

function StrataThumb({ photoId, size, brightness }: { photoId: string; size: number; brightness: number }) {
  const [err, setErr] = useState(false)
  if (err) {
    return (
      <div style={{ width: size, height: size, background: 'rgba(255,255,255,0.04)', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, opacity: 0.2 }}>⬛</span>
      </div>
    )
  }
  return (
    <img
      src={previewUrl(photoId)}
      alt=""
      onError={() => setErr(true)}
      style={{ width: size, height: size, objectFit: 'cover', display: 'block', borderRadius: 1, filter: `brightness(${brightness})` }}
      draggable={false}
    />
  )
}

function StrataQueue({ photos, currentIndex }: {
  photos: Photo[]
  currentIndex: number
}) {
  const upcoming: Photo[] = []
  for (let i = currentIndex + 1; i < photos.length && upcoming.length < 2; i++) {
    if (!photos[i].decision) upcoming.push(photos[i])
  }

  if (upcoming.length === 0) return null

  return (
    <div
      className="absolute flex flex-col gap-3 items-center pointer-events-none z-10"
      style={{ right: 28, top: '50%', transform: 'translateY(-50%)' }}
    >
      <AnimatePresence mode="popLayout">
        {upcoming.map((photo, i) => (
          <motion.div
            key={photo.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.75 }}
            animate={{
              opacity: i === 0 ? 0.50 : 0.24,
              y: 0,
              scale: i === 0 ? 1 : 0.84,
            }}
            exit={{ opacity: 0, y: -12, scale: 0.7 }}
            transition={{ duration: 0.38, ease: [0.25, 0, 0, 1] }}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: i === 0 ? '4px 4px 16px 4px' : '3px 3px 12px 3px',
              borderRadius: 3,
              boxShadow: `0 8px ${i === 0 ? 24 : 36}px rgba(0,0,0,${i === 0 ? 0.55 : 0.7})`,
            }}
          >
            <StrataThumb photoId={photo.id} size={i === 0 ? 76 : 58} brightness={i === 0 ? 0.72 : 0.48} />
          </motion.div>
        ))}
      </AnimatePresence>
      {(() => {
        const remaining = photos.slice(currentIndex + 1).filter((p) => !p.decision).length
        return remaining > 2 ? (
          <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, letterSpacing: '0.06em', marginTop: 2 }}>
            +{remaining - 2}
          </p>
        ) : null
      })()}
    </div>
  )
}

// ── Memory Capsule — 右上角记忆囊 ─────────────────────────────────────────

function MemoryCapsule({ count, pulseKey }: { count: number; pulseKey: number }) {
  const { t } = useTranslation()
  if (count === 0) return null
  return (
    <motion.div
      key={pulseKey}
      initial={pulseKey > 0 ? { scale: 1.18, boxShadow: '0 0 22px rgba(126,184,164,0.6)' } : false}
      animate={{ scale: 1, boxShadow: '0 0 0px rgba(126,184,164,0)' }}
      transition={{ duration: 0.55, ease: [0.25, 0, 0, 1] }}
      className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full pointer-events-none"
      style={{
        background: 'rgba(126,184,164,0.12)',
        border: '1px solid rgba(126,184,164,0.28)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-keep)' }} />
      <span style={{ color: 'var(--color-keep)', fontSize: 11, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
        {count} {t('decision.capsule.unit')}
      </span>
    </motion.div>
  )
}

// ── Main DecisionView ──────────────────────────────────────────────────────

export function DecisionView() {
  const {
    selectedEventId, selectedYear, selectedMonth,
    monthEvents, eventPhotos, currentPhotoIndex,
    sessionKept, sessionLeft, sessionFreedBytes,
    setEventPhotos, advancePhoto, goToNextEvent,
    updatePhotoDecision, pushHistory, popHistory,
    addSessionStats, navigateBack, setShowLightbox, showLightbox,
    totalDecisions, incrementDecisions, markMilestone, hasMilestone,
  } = useAppStore()
  const { t, lang } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<'intro' | 'deciding'>('intro')
  const [exitDir, setExitDir] = useState<ExitDir>(null)
  const [isPending, setIsPending] = useState(false)
  const [milestoneMsg, setMilestoneMsg] = useState<string | null>(null)
  const [keepPulseKey, setKeepPulseKey] = useState(0)
  const { ripples, trigger: triggerRipple } = useRipple()
  const containerRef = useRef<HTMLDivElement>(null)

  const color = strataColorForYear(selectedYear ?? 2021)
  const currentPhoto = eventPhotos[currentPhotoIndex] ?? null

  useEffect(() => {
    if (!selectedEventId) return
    void (async () => {
      setLoading(true)
      setPhase('intro')
      try {
        const { photos } = await getEventPhotos(selectedEventId)
        setEventPhotos(photos)
      } catch { /* suppress */ }
      setLoading(false)
      setTimeout(() => setPhase('deciding'), 800)
    })()
  }, [selectedEventId, setEventPhotos])

  const hasNextEvent = (() => {
    if (monthEvents.length === 0) return false
    const idx = monthEvents.findIndex((e) => e.id === selectedEventId)
    return monthEvents.some((e, i) => i !== idx && e.status !== 'completed')
  })()

  const handleNextEvent = useCallback(() => {
    const ok = goToNextEvent()
    if (!ok) navigateBack()
  }, [goToNextEvent, navigateBack])

  const decide = useCallback(async (decision: 'keep' | 'leave' | 'skip', rippleX?: number, rippleY?: number) => {
    if (!currentPhoto || isPending) return
    setIsPending(true)

    if (decision === 'leave') {
      setExitDir('down')
      triggerRipple(rippleX ?? window.innerWidth / 2, rippleY ?? window.innerHeight / 2, 'var(--color-leave)')
    } else if (decision === 'keep') {
      setExitDir('up')
      triggerRipple(rippleX ?? window.innerWidth / 2, rippleY ?? window.innerHeight / 2, 'var(--color-keep)')
      setKeepPulseKey((k) => k + 1)
    } else {
      setExitDir(null)
    }

    pushHistory({ photo_id: currentPhoto.id, previous_decision: currentPhoto.decision })
    updatePhotoDecision(currentPhoto.id, decision)

    try {
      const res = await postDecisions([{ photo_id: currentPhoto.id, decision }])
      if (decision === 'keep') addSessionStats(1, 0, 0)
      else if (decision === 'leave') addSessionStats(0, 1, res.freed_bytes_preview)
    } catch { /* suppress network error */ }

    incrementDecisions()
    const nextTotal = totalDecisions + 1
    const keptSoFar = eventPhotos.filter((p) => p.decision === 'keep').length + (decision === 'keep' ? 1 : 0)

    let milestone: string | null = null
    if (!hasMilestone('first_any')) {
      milestone = getMilestone('first_any', lang)
      markMilestone('first_any')
    } else if (decision === 'keep' && !hasMilestone('first_keep')) {
      milestone = getMilestone('first_keep', lang)
      markMilestone('first_keep')
    } else if (decision === 'leave' && !hasMilestone('first_leave')) {
      milestone = getMilestone('first_leave', lang)
      markMilestone('first_leave')
    } else if (decision === 'keep' && keptSoFar > 0 && keptSoFar % 10 === 0) {
      const key = `keep_${keptSoFar}`
      if (!hasMilestone(key)) { milestone = milestoneKeep(keptSoFar, lang); markMilestone(key) }
    } else if (nextTotal % 10 === 0) {
      const key = `total_${nextTotal}`
      if (!hasMilestone(key)) { milestone = milestoneTotal(nextTotal, lang); markMilestone(key) }
    }
    if (milestone) setMilestoneMsg(milestone)

    await new Promise((r) => setTimeout(r, 150))
    setExitDir(null)
    advancePhoto()
    setIsPending(false)
  }, [currentPhoto, isPending, pushHistory, updatePhotoDecision, addSessionStats, advancePhoto, triggerRipple,
      totalDecisions, incrementDecisions, markMilestone, hasMilestone, eventPhotos, lang])

  const handleUndo = useCallback(async () => {
    if (isPending) return
    const item = popHistory()
    if (!item) return
    setIsPending(true)
    try {
      await undoDecision(item.photo_id)
      updatePhotoDecision(item.photo_id, item.previous_decision)
    } catch { /* suppress undo error */ }
    setIsPending(false)
  }, [isPending, popHistory, updatePhotoDecision])

  const handleStar = useCallback(async () => {
    if (!currentPhoto) return
    try {
      const { is_book_candidate } = await toggleBookCandidate(currentPhoto.id)
      updatePhotoDecision(currentPhoto.id, currentPhoto.decision, is_book_candidate)
    } catch { /* suppress star error */ }
  }, [currentPhoto, updatePhotoDecision])

  const handleLeaveClick = useCallback((e: React.MouseEvent) => decide('leave', e.clientX, e.clientY), [decide])
  const handleKeepClick  = useCallback((e: React.MouseEvent) => decide('keep',  e.clientX, e.clientY), [decide])

  useKeyboardDecision({
    onKeep:    () => currentPhoto ? decide('keep')  : handleNextEvent(),
    onLeave:   () => decide('leave'),
    onSkip:    () => decide('skip'),
    onUndo:    handleUndo,
    onStar:    handleStar,
    onLightbox: () => setShowLightbox(!showLightbox),
    onBack:    navigateBack,
    disabled: loading || isPending || showLightbox || phase === 'intro' || milestoneMsg !== null,
  })

  if (loading) return <LoadingState />

  const decided = eventPhotos.filter((p) => p.decision !== null).length
  const pairedInfo = currentPhoto?.paired_photo_id
    ? (eventPhotos.some((p) => p.id === currentPhoto.paired_photo_id)
        ? t('decision.paired.raw')
        : t('decision.paired.jpeg'))
    : null

  const introCoverPhoto = eventPhotos[0] ?? null
  const eventGroupLabel = (() => {
    if (monthEvents.length === 0) return null
    const idx = monthEvents.findIndex((e) => e.id === selectedEventId)
    if (idx < 0) return null
    return lang === 'en'
      ? `${t('decision.group.prefix')} ${idx + 1} · ${eventPhotos.length} photos`
      : `第 ${idx + 1} 组 · 共 ${eventPhotos.length} 张`
  })()

  const monthLabel = lang === 'en'
    ? `${new Date(selectedYear!, selectedMonth! - 1).toLocaleString('en', { month: 'long' })} ${selectedYear}`
    : `${selectedYear}年${selectedMonth}月`

  return (
    <div ref={containerRef} className="h-full flex flex-col relative overflow-hidden">

      {/* Milestone overlay */}
      <MilestoneOverlay message={milestoneMsg} onDismiss={() => setMilestoneMsg(null)} />

      {/* Intro curtain */}
      <AnimatePresence>
        {phase === 'intro' && (
          <motion.div
            key="intro-curtain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0, 0, 1] }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center"
            style={{ background: 'rgba(8,8,16,0.90)', backdropFilter: 'blur(10px)' }}
          >
            {introCoverPhoto && (
              <div className="absolute inset-0 overflow-hidden">
                <img
                  src={previewUrl(introCoverPhoto.id)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ filter: 'blur(40px) brightness(0.12)', transform: 'scale(1.12)' }}
                />
              </div>
            )}
            <div className="relative z-10 text-center">
              <motion.p
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="font-serif tracking-widest"
                style={{ color: 'rgba(255,255,255,0.78)', fontSize: 20, fontWeight: 400 }}
              >
                {eventPhotos[0]?.shot_at
                  ? formatDateShort(eventPhotos[0].shot_at, lang)
                  : monthLabel}
              </motion.p>
              {eventGroupLabel && (
                <motion.p
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.22, duration: 0.4 }}
                  style={{ color: 'rgba(255,255,255,0.28)', fontSize: 12, marginTop: 8, letterSpacing: '0.08em' }}
                >
                  {eventGroupLabel}
                </motion.p>
              )}
              <motion.div
                className="flex gap-1.5 justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.4 }}
                style={{ marginTop: 20 }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.32)' }}
                    animate={{ opacity: [0.32, 1, 0.32] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.25, ease: 'easeInOut' }}
                  />
                ))}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ripple overlays */}
      {ripples.map((r) => (
        <motion.div
          key={r.id}
          className="absolute rounded-full pointer-events-none"
          style={{ left: r.x, top: r.y, translateX: '-50%', translateY: '-50%', background: r.color, opacity: 0.18 }}
          initial={{ width: 0, height: 0 }}
          animate={{ width: 700, height: 700, opacity: 0 }}
          transition={{ duration: 0.65, ease: 'easeOut' }}
        />
      ))}

      {/* Background blur */}
      <AnimatePresence mode="sync">
        {currentPhoto && (
          <motion.div
            key={currentPhoto.id}
            className="absolute inset-0 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.25, 0, 0, 1] }}
          >
            <img
              src={previewUrl(currentPhoto.id)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'blur(40px) brightness(0.18)', transform: 'scale(1.1)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Noise texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: NOISE_BG,
          backgroundSize: '256px 256px',
          opacity: 0.038,
          mixBlendMode: 'overlay',
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-6 py-4">
        <button
          onClick={navigateBack}
          className="text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {t('decision.back')}
        </button>
        <span style={{ color: 'var(--color-text-muted)' }}>/</span>
        <span className="text-xs" style={{ color }}>
          {monthLabel}
        </span>
        {monthEvents.length > 0 && (() => {
          const idx = monthEvents.findIndex((e) => e.id === selectedEventId)
          if (idx < 0) return null
          const groupLabel = lang === 'en'
            ? `${t('decision.group.prefix')} ${idx + 1} of ${monthEvents.length}`
            : `第 ${idx + 1} 组 / 共 ${monthEvents.length} 组`
          return (
            <>
              <span style={{ color: 'var(--color-text-muted)' }}>/</span>
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {groupLabel}
              </span>
              {eventPhotos.length > 1 && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{
                  background: 'var(--color-glass)', color: 'var(--color-text-muted)', fontSize: 10,
                }}>
                  {t('decision.burst.label')} {eventPhotos.length}
                </span>
              )}
            </>
          )
        })()}
        <span style={{ color: 'var(--color-text-muted)' }}>/</span>
        <span className="text-xs font-tabular" style={{ color: 'var(--color-text-secondary)' }}>
          {Math.min(currentPhotoIndex + 1, eventPhotos.length)} / {eventPhotos.length}
        </span>
        {currentPhoto?.is_book_candidate && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(232,200,120,0.15)', color: 'var(--color-star)', fontSize: 10 }}>
            {t('decision.book.badge')}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={handleStar}
          className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-70"
          style={{ color: currentPhoto?.is_book_candidate ? 'var(--color-star)' : 'var(--color-text-muted)', border: '1px solid currentColor' }}
        >
          ★ F
        </button>
        <button
          onClick={handleUndo}
          className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-muted)', border: '1px solid currentColor' }}
        >
          {t('decision.undo')}
        </button>
      </div>

      {/* 核心照片区域 */}
      <div className="relative z-10 flex-1" style={{ minHeight: 0 }}>

        {currentPhoto ? (
          <>
            <PhotoDisplay photo={currentPhoto} exitDir={exitDir} />

            <AnimatePresence mode="wait">
              <MemoryContextCard key={currentPhoto.id} photo={currentPhoto} />
            </AnimatePresence>

            <StrataQueue photos={eventPhotos} currentIndex={currentPhotoIndex} />

            <MemoryCapsule count={sessionKept} pulseKey={keepPulseKey} />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <AllDoneState
              onBack={navigateBack}
              onNext={handleNextEvent}
              hasNext={hasNextEvent}
              keptPhotos={eventPhotos.filter((p) => p.decision === 'keep')}
              sessionLeft={eventPhotos.filter((p) => p.decision === 'leave').length}
              freedBytes={eventPhotos.filter((p) => p.decision === 'leave').reduce((s, p) => s + p.file_size_bytes, 0)}
              eventStartShotAt={eventPhotos[0]?.shot_at}
            />
          </div>
        )}
      </div>

      {/* Bottom section */}
      <div className="relative z-10 flex flex-col gap-3 px-6 pb-6">
        {pairedInfo && (
          <p className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {pairedInfo}
          </p>
        )}

        {currentPhoto && (
          <ActionButtons
            onSkip={() => decide('skip')}
            onLeaveClick={handleLeaveClick}
            onKeepClick={handleKeepClick}
          />
        )}

        {/* Stats bar */}
        <div className="flex items-center justify-center gap-6 text-xs font-tabular" style={{ color: 'var(--color-text-secondary)' }}>
          <span>{t('decision.processed')} <span className="text-primary">{decided}</span></span>
          <span>{t('stats.carried')} <span style={{ color: 'var(--color-keep)' }}>{sessionKept}</span></span>
          <span>{t('stats.left')} <span style={{ color: 'var(--color-leave)' }}>{sessionLeft}</span></span>
          {sessionFreedBytes > 0 && (
            <span>{t('decision.freed')} <span style={{ color: 'var(--color-keep)' }}>{formatBytes(sessionFreedBytes)}</span></span>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {showLightbox && currentPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(8,8,16,0.96)' }}
            onClick={() => setShowLightbox(false)}
          >
            <img
              src={previewUrl(currentPhoto.id)}
              alt={currentPhoto.file_name}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="absolute bottom-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {t('decision.lightbox.hint')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Action Buttons ─────────────────────────────────────────────────────────

function ActionButtons({
  onSkip, onLeaveClick, onKeepClick,
}: {
  onSkip: () => void
  onLeaveClick: (e: React.MouseEvent) => void
  onKeepClick: (e: React.MouseEvent) => void
}) {
  const { t } = useTranslation()
  const [leaveActive, setLeaveActive] = useState(false)
  const [keepActive, setKeepActive] = useState(false)

  const handleLeave = (e: React.MouseEvent) => {
    setLeaveActive(true)
    setTimeout(() => setLeaveActive(false), 500)
    onLeaveClick(e)
  }
  const handleKeep = (e: React.MouseEvent) => {
    setKeepActive(true)
    setTimeout(() => setKeepActive(false), 500)
    onKeepClick(e)
  }

  return (
    <div className="flex items-center justify-center gap-4">
      {/* Leave */}
      <motion.button
        onClick={handleLeave}
        whileHover={{ scale: 1.03 }}
        animate={leaveActive
          ? { y: 4, scale: 0.97, filter: 'brightness(1.2)' }
          : { y: 0, scale: 1,    filter: 'brightness(1)' }}
        transition={{ duration: 0.18, ease: [0.25, 0, 0, 1] }}
        className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm tracking-wider"
        style={{ background: 'rgba(139,115,85,0.18)', border: '1px solid var(--color-leave)', color: 'var(--color-leave)' }}
      >
        <span>←</span>
        <span>{leaveActive ? t('btn.leave.active') : t('btn.leave')}</span>
        <kbd style={{ fontSize: 9, opacity: 0.38, marginLeft: 4, padding: '1px 4px', borderRadius: 3, border: '1px solid currentColor', fontFamily: 'monospace' }}>D</kbd>
      </motion.button>

      {/* Skip */}
      <motion.button
        onClick={onSkip}
        whileHover={{ scale: 1.03, opacity: 1 }}
        whileTap={{ scale: 0.97 }}
        className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm tracking-wider"
        style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)', color: 'var(--color-text-secondary)', opacity: 0.48 }}
      >
        <span>↑</span> {t('btn.skip')}
        <kbd style={{ fontSize: 9, opacity: 0.38, marginLeft: 4, padding: '1px 4px', borderRadius: 3, border: '1px solid currentColor', fontFamily: 'monospace' }}>S</kbd>
      </motion.button>

      {/* Keep */}
      <motion.button
        onClick={handleKeep}
        whileHover={{ scale: 1.03 }}
        animate={keepActive
          ? { y: -4, scale: 1.03, filter: 'brightness(1.2)' }
          : { y: 0, scale: 1,     filter: 'brightness(1)' }}
        transition={{ duration: 0.18, ease: [0.25, 0, 0, 1] }}
        className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm tracking-wider"
        style={{ background: 'rgba(126,184,164,0.18)', border: '1px solid var(--color-keep)', color: 'var(--color-keep)' }}
      >
        <span>{keepActive ? t('btn.keep.active') : t('btn.keep')}</span>
        <span>→</span>
        <kbd style={{ fontSize: 9, opacity: 0.38, marginLeft: 4, padding: '1px 4px', borderRadius: 3, border: '1px solid currentColor', fontFamily: 'monospace' }}>K</kbd>
      </motion.button>
    </div>
  )
}

// ── Loading ────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="h-full flex items-center justify-center">
      <motion.div
        className="w-8 h-8 rounded-full border-2"
        style={{ borderColor: 'var(--strata-2022)', borderTopColor: 'transparent' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

// ── AllDoneState ───────────────────────────────────────────────────────────

function AllDoneState({
  onBack, onNext, hasNext, keptPhotos, sessionLeft, freedBytes, eventStartShotAt,
}: {
  onBack: () => void
  onNext: () => void
  hasNext: boolean
  keptPhotos: Photo[]
  sessionLeft: number
  freedBytes: number
  eventStartShotAt?: string
}) {
  const { t, lang } = useTranslation()
  const polaroidPhotos = keptPhotos.slice(0, 4)
  const rotations = [-3.5, 2.2, -1.8, 3.0]
  const eventTitle = eventStartShotAt ? formatEventTitle(eventStartShotAt, lang) : null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-5 text-center"
      style={{ maxWidth: 440 }}
    >
      <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.08 }}>
        <p className="font-serif tracking-widest" style={{ color: 'var(--strata-2022)', fontSize: 'var(--text-display)', fontWeight: 400, lineHeight: 1.2 }}>
          {t('done.group.title')}
        </p>
        {eventTitle && (
          <p className="text-xs mt-2 tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            {eventTitle}
          </p>
        )}
      </motion.div>

      {polaroidPhotos.length > 0 && (
        <div className="flex items-end justify-center gap-3 my-1" style={{ minHeight: 110 }}>
          {polaroidPhotos.map((photo, i) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, scale: 0.75, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0, rotate: rotations[i] ?? 0 }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.4, ease: [0.25, 0, 0, 1] }}
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.13)',
                padding: '5px 5px 18px 5px',
                borderRadius: 3,
                boxShadow: '0 6px 28px rgba(0,0,0,0.5)',
              }}
            >
              <StrataThumb photoId={photo.id} size={76} brightness={1} />
            </motion.div>
          ))}
        </div>
      )}

      <motion.div className="flex flex-col items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}>
        <p className="text-sm font-light" style={{ color: 'var(--color-text-secondary)' }}>
          {t('done.group.carried')}{' '}<span style={{ color: 'var(--color-keep)' }}>{keptPhotos.length}</span>{' '}{t('done.group.memories')}
        </p>
        {(sessionLeft > 0 || freedBytes > 0) && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {sessionLeft > 0 && `${t('done.group.left')} ${sessionLeft}`}
            {sessionLeft > 0 && freedBytes > 0 && '，'}
            {freedBytes > 0 && `${t('done.group.freed')} ${formatBytes(freedBytes)}`}
          </p>
        )}
      </motion.div>

      <motion.div className="flex gap-3" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }}>
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg text-sm tracking-wider transition-opacity hover:opacity-70"
          style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}
        >
          {t('done.back.list')}
        </button>
        {hasNext ? (
          <button
            onClick={onNext}
            className="px-6 py-2.5 rounded-lg text-sm tracking-wider transition-opacity hover:opacity-70"
            style={{ background: 'var(--color-keep)', color: '#0A0A0F' }}
          >
            {t('done.next.group')} <span className="ml-1 opacity-60 text-xs">K</span>
          </button>
        ) : (
          <button
            onClick={onBack}
            className="px-6 py-2.5 rounded-lg text-sm tracking-wider transition-opacity hover:opacity-70"
            style={{ background: 'var(--color-keep)', color: '#0A0A0F' }}
          >
            {t('done.all.month')}
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}
