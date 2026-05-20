import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getEventPhotos, postDecisions, undoDecision, toggleBookCandidate, previewUrl, getDayPhotoCount } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { useKeyboardDecision } from '../../hooks/useKeyboardDecision'
import { formatBytes, strataColorForYear } from '../../utils'
import { MilestoneOverlay } from '../shared/MilestoneOverlay'
import type { Photo } from '../../types'

// ── Memory context helpers ─────────────────────────────────────────────────

function formatShotAt(shotAt: string): string {
  const d = new Date(shotAt.replace(' ', 'T'))
  if (isNaN(d.getTime())) return shotAt
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const weekDay = weekDays[d.getDay()]
  let timeStr: string
  if (hour === 0) timeStr = '午夜'
  else if (hour < 6) timeStr = `凌晨 ${hour} 点`
  else if (hour < 12) timeStr = `上午 ${hour} 点`
  else if (hour === 12) timeStr = '正午'
  else if (hour < 18) timeStr = `下午 ${hour - 12} 点`
  else if (hour < 21) timeStr = `傍晚 ${hour - 12} 点`
  else timeStr = `夜里 ${hour - 12} 点`
  return `${year}年${month}月${day}日，星期${weekDay}，${timeStr}`
}

function formatEventTitle(shotAt: string): string {
  const d = new Date(shotAt.replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours()
  let timeStr: string
  if (hour === 0) timeStr = '午夜'
  else if (hour < 6) timeStr = `凌晨 ${hour} 点`
  else if (hour < 12) timeStr = `上午 ${hour} 点`
  else if (hour === 12) timeStr = '正午'
  else if (hour < 18) timeStr = `下午 ${hour - 12} 点`
  else if (hour < 21) timeStr = `傍晚 ${hour - 12} 点`
  else timeStr = `夜里 ${hour - 12} 点`
  return `${year}年${month}月${day}日 · ${timeStr}的连拍`
}

function simplifyCamera(model?: string): string | null {
  if (!model) return null
  const m = model.toLowerCase()
  if (m.includes('ilce') || m.includes('sony') || /^a[679]\d/.test(m)) return '索尼'
  if (m.includes('fujifilm') || m.includes('fuji') || m.startsWith('x-') || m.startsWith('gfx')) return '富士'
  if (m.includes('iphone') || m.includes('apple')) return 'iPhone'
  if (m.includes('canon')) return '佳能'
  if (m.includes('nikon')) return '尼康'
  if (m.includes('leica')) return '徕卡'
  if (m.includes('dji')) return 'DJI'
  return null
}

// Cache day counts so we don't re-fetch for the same date
const dayCountCache = new Map<string, number>()

function MemoryContextCard({ photo }: { photo: Photo }) {
  const dateKey = photo.shot_at ? photo.shot_at.slice(0, 10) : null
  const [dayCount, setDayCount] = useState<number | null>(
    dateKey && dayCountCache.has(dateKey) ? dayCountCache.get(dateKey)! : null
  )

  useEffect(() => {
    if (!dateKey) return
    if (dayCountCache.has(dateKey)) {
      setDayCount(dayCountCache.get(dateKey)!)
      return
    }
    getDayPhotoCount(dateKey)
      .then(({ count }) => {
        dayCountCache.set(dateKey, count)
        setDayCount(count)
      })
      .catch(() => {}) // backend endpoint may not exist yet — silently skip
  }, [dateKey])

  const formattedDate = photo.shot_at ? formatShotAt(photo.shot_at) : null
  const location = photo.gps_city
    ? `${photo.gps_city}${photo.gps_country ? `，${photo.gps_country}` : ''}`
    : photo.gps_country ?? null
  const camera = simplifyCamera(photo.camera_model)

  if (!formattedDate && !location && !camera) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.35, delay: 0.12, ease: [0.25, 0, 0, 1] }}
      className="absolute bottom-4 left-4 z-20 rounded-xl px-3 py-2.5 pointer-events-none"
      style={{
        background: 'rgba(0,0,0,0.42)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.07)',
        maxWidth: 230,
      }}
    >
      {formattedDate && (
        <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, lineHeight: 1.5, letterSpacing: '0.02em', fontWeight: 300 }}>
          {formattedDate}
        </p>
      )}
      <div className="flex items-center gap-3 mt-1" style={{ fontSize: 10 }}>
        {location && (
          <span style={{ color: 'rgba(255,255,255,0.42)' }}>
            ↟ {location}
          </span>
        )}
        {camera && (
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>
            {camera}
          </span>
        )}
      </div>
      {dayCount !== null && (
        <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 10, marginTop: 4 }}>
          今天拍了 {dayCount} 张
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

// ── Photo display ──────────────────────────────────────────────────────────

type ExitDir = 'down' | 'up' | null

function PhotoDisplay({ photo, exitDir }: { photo: Photo; exitDir: ExitDir }) {
  const variants = {
    // 从黑暗里显影出来
    enter: { opacity: 0, scale: 0.97, filter: 'brightness(0) blur(4px)' },
    center: { opacity: 1, scale: 1, filter: 'brightness(1) blur(0px)' },
    exit: {
      opacity: 0,
      scale: exitDir === 'down' ? 0.95 : 1.02,
      y: exitDir === 'down' ? 10 : -5,
      filter: 'brightness(0.4) blur(3px)',
    },
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={photo.id}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.5, ease: [0.25, 0, 0, 1] }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <img
          src={previewUrl(photo.id)}
          alt={photo.file_name}
          className="max-w-full max-h-full object-contain"
          style={{ maxHeight: 'calc(100vh - 220px)' }}
          draggable={false}
        />
      </motion.div>
    </AnimatePresence>
  )
}

// ── Thumbnail strip ────────────────────────────────────────────────────────

function ThumbnailStrip({ photos, currentIndex, onSelect }: {
  photos: Photo[]
  currentIndex: number
  onSelect: (i: number) => void
}) {
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = stripRef.current?.children[currentIndex] as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [currentIndex])

  const dotColor = (p: Photo) => {
    if (p.decision === 'keep') return 'var(--color-keep)'
    if (p.decision === 'leave') return 'var(--color-leave)'
    if (p.decision === 'skip') return 'var(--color-text-muted)'
    return 'transparent'
  }

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-2 px-4" ref={stripRef}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {photos.map((p, i) => (
        <button
          key={p.id}
          onClick={() => onSelect(i)}
          className="relative flex-shrink-0 rounded overflow-hidden transition-all"
          style={{
            width: i === currentIndex ? 48 : 32,
            height: i === currentIndex ? 48 : 32,
            border: i === currentIndex ? '2px solid rgba(255,255,255,0.6)' : '2px solid transparent',
            opacity: i === currentIndex ? 1 : 0.45,
          }}
        >
          <img src={previewUrl(p.id)} alt="" className="w-full h-full object-cover" />
          {p.decision && (
            <div
              className="absolute bottom-0 left-0 right-0 h-1"
              style={{ background: dotColor(p) }}
            />
          )}
        </button>
      ))}
    </div>
  )
}

// ── Action buttons ─────────────────────────────────────────────────────────

function ActionButtons({
  onSkip, onLeaveClick, onKeepClick,
}: {
  onSkip: () => void
  onLeaveClick: (e: React.MouseEvent) => void
  onKeepClick: (e: React.MouseEvent) => void
}) {
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
      {/* 留在这里 — sinks down on press */}
      <motion.button
        onClick={handleLeave}
        whileHover={{ scale: 1.03 }}
        animate={leaveActive
          ? { y: 4, scale: 0.97, filter: 'brightness(1.2)' }
          : { y: 0, scale: 1, filter: 'brightness(1)' }}
        transition={{ duration: 0.18, ease: [0.25, 0, 0, 1] }}
        className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm tracking-wider"
        style={{ background: 'rgba(139,115,85,0.2)', border: '1px solid var(--color-leave)', color: 'var(--color-leave)' }}
      >
        <span>←</span>
        <span>{leaveActive ? '留在这片土地上' : '留在这里'}</span>
        <kbd className="text-xs opacity-40 ml-1 px-1 py-0.5 rounded" style={{ border: '1px solid currentColor', fontFamily: 'monospace', fontSize: 9 }}>D</kbd>
      </motion.button>

      {/* 稍后 — low presence */}
      <motion.button
        onClick={onSkip}
        whileHover={{ scale: 1.03, opacity: 1 }}
        whileTap={{ scale: 0.97 }}
        className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm tracking-wider"
        style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)', color: 'var(--color-text-secondary)', opacity: 0.5 }}
      >
        <span>↑</span> 稍后
        <kbd className="text-xs opacity-40 ml-1 px-1 py-0.5 rounded" style={{ border: '1px solid currentColor', fontFamily: 'monospace', fontSize: 9 }}>S</kbd>
      </motion.button>

      {/* 带走 — lifts up on press */}
      <motion.button
        onClick={handleKeep}
        whileHover={{ scale: 1.03 }}
        animate={keepActive
          ? { y: -4, scale: 1.03, filter: 'brightness(1.2)' }
          : { y: 0, scale: 1, filter: 'brightness(1)' }}
        transition={{ duration: 0.18, ease: [0.25, 0, 0, 1] }}
        className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm tracking-wider"
        style={{ background: 'rgba(126,184,164,0.2)', border: '1px solid var(--color-keep)', color: 'var(--color-keep)' }}
      >
        <span>{keepActive ? '带入行囊' : '带走'}</span> <span>→</span>
        <kbd className="text-xs opacity-40 ml-1 px-1 py-0.5 rounded" style={{ border: '1px solid currentColor', fontFamily: 'monospace', fontSize: 9 }}>K</kbd>
      </motion.button>
    </div>
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
    setCurrentPhotoIndex,
    totalDecisions, incrementDecisions, markMilestone, hasMilestone,
  } = useAppStore()

  const [loading, setLoading] = useState(true)
  // 'intro' = 0.8s curtain before first photo; 'deciding' = normal flow
  const [phase, setPhase] = useState<'intro' | 'deciding'>('intro')
  const [exitDir, setExitDir] = useState<ExitDir>(null)
  const [isPending, setIsPending] = useState(false)
  const [milestoneMsg, setMilestoneMsg] = useState<string | null>(null)
  const { ripples, trigger: triggerRipple } = useRipple()
  const containerRef = useRef<HTMLDivElement>(null)

  const color = strataColorForYear(selectedYear ?? 2021)
  const currentPhoto = eventPhotos[currentPhotoIndex] ?? null

  useEffect(() => {
    if (!selectedEventId) return
    setLoading(true)
    setPhase('intro')
    getEventPhotos(selectedEventId)
      .then(({ photos }) => setEventPhotos(photos))
      .catch(() => {})
      .finally(() => {
        setLoading(false)
        // Show intro curtain for 0.8s, then enter deciding phase
        setTimeout(() => setPhase('deciding'), 800)
      })
  }, [selectedEventId, setEventPhotos])

  // 计算当前组在月内的位置，用于「下一组」按钮
  const hasNextEvent = (() => {
    if (monthEvents.length === 0) return false
    const idx = monthEvents.findIndex((e) => e.id === selectedEventId)
    // 任意位置只要还有未完成的组就算 hasNext
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
    } else {
      setExitDir(null)
    }

    pushHistory({ photo_id: currentPhoto.id, previous_decision: currentPhoto.decision })
    updatePhotoDecision(currentPhoto.id, decision)

    try {
      const res = await postDecisions([{ photo_id: currentPhoto.id, decision }])
      if (decision === 'keep') addSessionStats(1, 0, 0)
      else if (decision === 'leave') addSessionStats(0, 1, res.freed_bytes_preview)
    } catch {}

    // Milestone checks (after stats update)
    incrementDecisions()
    const nextTotal = totalDecisions + 1
    const keptSoFar = eventPhotos.filter((p) => p.decision === 'keep').length + (decision === 'keep' ? 1 : 0)

    let milestone: string | null = null
    if (!hasMilestone('first_any')) {
      milestone = '第一个瞬间，从地层里浮现了'
      markMilestone('first_any')
    } else if (decision === 'keep' && !hasMilestone('first_keep')) {
      milestone = '这段记忆，属于你了'
      markMilestone('first_keep')
    } else if (decision === 'leave' && !hasMilestone('first_leave')) {
      milestone = '你让它留在了这里 — 它会等着'
      markMilestone('first_leave')
    } else if (decision === 'keep' && keptSoFar > 0 && keptSoFar % 10 === 0) {
      const key = `keep_${keptSoFar}`
      if (!hasMilestone(key)) {
        milestone = `你已经带走了 ${keptSoFar} 段记忆`
        markMilestone(key)
      }
    } else if (nextTotal % 10 === 0) {
      const key = `total_${nextTotal}`
      if (!hasMilestone(key)) {
        milestone = `${nextTotal} 张照片，${nextTotal} 个选择`
        markMilestone(key)
      }
    }
    if (milestone) setMilestoneMsg(milestone)

    await new Promise((r) => setTimeout(r, 150))
    setExitDir(null)
    advancePhoto()
    setIsPending(false)
  }, [currentPhoto, isPending, pushHistory, updatePhotoDecision, addSessionStats, advancePhoto, triggerRipple,
      totalDecisions, incrementDecisions, markMilestone, hasMilestone, eventPhotos])

  const handleUndo = useCallback(async () => {
    if (isPending) return
    const item = popHistory()
    if (!item) return
    setIsPending(true)
    try {
      await undoDecision(item.photo_id)
      updatePhotoDecision(item.photo_id, item.previous_decision)
    } catch {}
    setIsPending(false)
  }, [isPending, popHistory, updatePhotoDecision])

  const handleStar = useCallback(async () => {
    if (!currentPhoto) return
    try {
      const { is_book_candidate } = await toggleBookCandidate(currentPhoto.id)
      updatePhotoDecision(currentPhoto.id, currentPhoto.decision, is_book_candidate)
    } catch {}
  }, [currentPhoto, updatePhotoDecision])

  const handleLeaveClick = useCallback((e: React.MouseEvent) => {
    decide('leave', e.clientX, e.clientY)
  }, [decide])

  const handleKeepClick = useCallback((e: React.MouseEvent) => {
    decide('keep', e.clientX, e.clientY)
  }, [decide])

  useKeyboardDecision({
    // 完成状态下 K/→ 改为「进入下一组」
    onKeep: () => currentPhoto ? decide('keep') : handleNextEvent(),
    onLeave: () => decide('leave'),
    onSkip: () => decide('skip'),
    onUndo: handleUndo,
    onStar: handleStar,
    onLightbox: () => setShowLightbox(!showLightbox),
    onBack: navigateBack,
    disabled: loading || isPending || showLightbox || phase === 'intro' || milestoneMsg !== null,
  })

  if (loading) return <LoadingState />

  const decided = eventPhotos.filter((p) => p.decision !== null).length
  const pairedInfo = currentPhoto?.paired_photo_id
    ? (eventPhotos.some((p) => p.id === currentPhoto.paired_photo_id) ? '此照片有配套 RAW 文件' : '此照片有配套 JPEG 文件')
    : null

  const introCoverPhoto = eventPhotos[0] ?? null
  const eventGroupLabel = (() => {
    if (monthEvents.length === 0) return null
    const idx = monthEvents.findIndex((e) => e.id === selectedEventId)
    return idx >= 0 ? `第 ${idx + 1} 组 · 共 ${eventPhotos.length} 张` : null
  })()

  return (
    <div ref={containerRef} className="h-full flex flex-col relative overflow-hidden">
      {/* Milestone overlay */}
      <MilestoneOverlay message={milestoneMsg} onDismiss={() => setMilestoneMsg(null)} />

      {/* Intro curtain — shown for 0.8s before first photo */}
      <AnimatePresence>
        {phase === 'intro' && (
          <motion.div
            key="intro-curtain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0, 0, 1] }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center"
            style={{ background: 'rgba(10,10,15,0.88)', backdropFilter: 'blur(8px)' }}
          >
            {/* Blurred cover image behind curtain */}
            {introCoverPhoto && (
              <div className="absolute inset-0 overflow-hidden">
                <img
                  src={previewUrl(introCoverPhoto.id)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ filter: 'blur(40px) brightness(0.15)', transform: 'scale(1.1)' }}
                />
              </div>
            )}
            <div className="relative z-10 text-center">
              <motion.p
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="text-xl font-light tracking-widest"
                style={{ color: 'rgba(255,255,255,0.82)' }}
              >
                {eventPhotos[0]?.shot_at
                  ? (() => {
                      const d = new Date(eventPhotos[0].shot_at.replace(' ', 'T'))
                      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
                    })()
                  : `${selectedYear}年${selectedMonth}月`}
              </motion.p>
              {eventGroupLabel && (
                <motion.p
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.22, duration: 0.4 }}
                  className="text-xs mt-2 tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.32)' }}
                >
                  {eventGroupLabel}
                </motion.p>
              )}
              <motion.div
                className="flex gap-1.5 justify-center mt-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.4 }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.35)' }}
                    animate={{ opacity: [0.35, 1, 0.35] }}
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
          style={{
            left: r.x,
            top: r.y,
            translateX: '-50%',
            translateY: '-50%',
            background: r.color,
            opacity: 0.15,
          }}
          initial={{ width: 0, height: 0 }}
          animate={{ width: 600, height: 600, opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      ))}

      {/* Blurred background — crossfade with each photo */}
      <AnimatePresence mode="sync">
        {currentPhoto && (
          <motion.div
            key={currentPhoto.id}
            className="absolute inset-0 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0, 0, 1] }}
          >
            <img
              src={previewUrl(currentPhoto.id)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'blur(40px) brightness(0.25)', transform: 'scale(1.1)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-6 py-4">
        <button
          onClick={navigateBack}
          className="text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ← 返回
        </button>
        <span style={{ color: 'var(--color-text-muted)' }}>/</span>
        <span className="text-xs" style={{ color }}>
          {selectedYear}年{selectedMonth}月
        </span>
        {monthEvents.length > 0 && (() => {
          const idx = monthEvents.findIndex((e) => e.id === selectedEventId)
          if (idx < 0) return null
          return (
            <>
              <span style={{ color: 'var(--color-text-muted)' }}>/</span>
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                第 {idx + 1} 组 / 共 {monthEvents.length} 组
              </span>
              {eventPhotos.length > 1 && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{
                  background: 'var(--color-glass)', color: 'var(--color-text-muted)', fontSize: 10,
                }}>
                  连拍 {eventPhotos.length} 张
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
            ★ 书候选
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={handleStar}
          className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-70"
          style={{
            color: currentPhoto?.is_book_candidate ? 'var(--color-star)' : 'var(--color-text-muted)',
            border: '1px solid currentColor',
          }}
        >
          ★ F
        </button>
        <button
          onClick={handleUndo}
          className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-muted)', border: '1px solid currentColor' }}
        >
          撤销 Z
        </button>
      </div>

      {/* Photo area */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6">
        {currentPhoto ? (
          <>
            <PhotoDisplay photo={currentPhoto} exitDir={exitDir} />
            <AnimatePresence mode="wait">
              <MemoryContextCard key={currentPhoto.id} photo={currentPhoto} />
            </AnimatePresence>
          </>
        ) : (
          <AllDoneState
            onBack={navigateBack}
            onNext={handleNextEvent}
            hasNext={hasNextEvent}
            keptPhotos={eventPhotos.filter((p) => p.decision === 'keep')}
            sessionLeft={eventPhotos.filter((p) => p.decision === 'leave').length}
            freedBytes={eventPhotos.filter((p) => p.decision === 'leave').reduce((s, p) => s + p.file_size_bytes, 0)}
            eventStartShotAt={eventPhotos[0]?.shot_at}
          />
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
          <>
            {/* Thumbnail strip */}
            <ThumbnailStrip
              photos={eventPhotos}
              currentIndex={currentPhotoIndex}
              onSelect={(i) => { if (i !== currentPhotoIndex) setCurrentPhotoIndex(i) }}
            />

            {/* Action buttons */}
            <ActionButtons
              onSkip={() => decide('skip')}
              onLeaveClick={handleLeaveClick}
              onKeepClick={handleKeepClick}
            />
          </>
        )}

        {/* Stats bar */}
        <div className="flex items-center justify-center gap-6 text-xs font-tabular" style={{ color: 'var(--color-text-secondary)' }}>
          <span>已处理 <span className="text-primary">{decided}</span> 张</span>
          <span>带走 <span style={{ color: 'var(--color-keep)' }}>{sessionKept}</span></span>
          <span>留下 <span style={{ color: 'var(--color-leave)' }}>{sessionLeft}</span></span>
          {sessionFreedBytes > 0 && (
            <span>释放 <span style={{ color: 'var(--color-keep)' }}>{formatBytes(sessionFreedBytes)}</span></span>
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
            style={{ background: 'rgba(10,10,15,0.95)' }}
            onClick={() => setShowLightbox(false)}
          >
            <img
              src={previewUrl(currentPhoto.id)}
              alt={currentPhoto.file_name}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="absolute bottom-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              按 Space 或点击背景关闭
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

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
  const polaroidPhotos = keptPhotos.slice(0, 4)
  // Fixed slight rotations — natural Polaroid feel without re-randomising every render
  const rotations = [-3.5, 2.2, -1.8, 3.0]
  const eventTitle = eventStartShotAt ? formatEventTitle(eventStartShotAt) : null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-5 text-center"
      style={{ maxWidth: 440 }}
    >
      {/* Title */}
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08 }}
      >
        <p className="text-2xl font-light tracking-widest" style={{ color: 'var(--strata-2022)' }}>
          这一组挖完了
        </p>
        {eventTitle && (
          <p className="text-xs mt-2 tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            {eventTitle}
          </p>
        )}
      </motion.div>

      {/* Polaroid grid */}
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
              <img
                src={previewUrl(photo.id)}
                alt=""
                style={{ width: 76, height: 76, objectFit: 'cover', display: 'block', borderRadius: 1 }}
                draggable={false}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Stats */}
      <motion.div
        className="flex flex-col items-center gap-1.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.38 }}
      >
        <p className="text-sm font-light" style={{ color: 'var(--color-text-secondary)' }}>
          带走了{' '}
          <span style={{ color: 'var(--color-keep)' }}>{keptPhotos.length}</span>{' '}
          段记忆
        </p>
        {(sessionLeft > 0 || freedBytes > 0) && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {sessionLeft > 0 && `留下 ${sessionLeft} 张`}
            {sessionLeft > 0 && freedBytes > 0 && '，'}
            {freedBytes > 0 && `释放了 ${formatBytes(freedBytes)}`}
          </p>
        )}
      </motion.div>

      {/* Buttons */}
      <motion.div
        className="flex gap-3"
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.45 }}
      >
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg text-sm tracking-wider transition-opacity hover:opacity-70"
          style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}
        >
          ← 返回列表
        </button>
        {hasNext ? (
          <button
            onClick={onNext}
            className="px-6 py-2.5 rounded-lg text-sm tracking-wider transition-opacity hover:opacity-70"
            style={{ background: 'var(--color-keep)', color: '#0A0A0F' }}
          >
            下一组 →
            <span className="ml-2 text-xs opacity-60">K</span>
          </button>
        ) : (
          <button
            onClick={onBack}
            className="px-6 py-2.5 rounded-lg text-sm tracking-wider transition-opacity hover:opacity-70"
            style={{ background: 'var(--color-keep)', color: '#0A0A0F' }}
          >
            本月已全部完成
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}
