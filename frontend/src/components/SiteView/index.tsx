import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getEvents, previewUrl } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { formatTime, strataColorForYear } from '../../utils'
import type { Event } from '../../types'

// 卡片高度按照片数量分级
function cardHeight(n: number): number {
  if (n <= 5) return 160
  if (n <= 20) return 220
  return 280
}

// Framer Motion variants — 父级 whileHover="hover" 传递给子级
const cardVariants = {
  rest: { opacity: 1 },
  hover: { opacity: 1 },
}
const imageVariants = {
  rest:  { scale: 1 },
  hover: { scale: 1.04 },
}

// ── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event, onClick, index }: { event: Event; onClick: () => void; index: number }) {
  const color = strataColorForYear(event.year)
  const pct = event.photo_count > 0 ? event.decided_count / event.photo_count : 0
  const height = cardHeight(event.photo_count)
  const isDone = event.status === 'completed'
  const isInProgress = event.status === 'in_progress'
  const isPending = event.status === 'pending'

  // 时间显示：只显示 HH:MM，去掉重复日期
  const timeLabel = event.ended_at && event.ended_at !== event.started_at
    ? `${formatTime(event.started_at)} — ${formatTime(event.ended_at)}`
    : formatTime(event.started_at)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.03, ease: [0.25, 0, 0, 1] }}
      // break-inside: avoid 防止卡片被 CSS columns 截断
      style={{ breakInside: 'avoid', marginBottom: 10 }}
    >
      <motion.button
        initial="rest"
        whileHover="hover"
        variants={cardVariants}
        onClick={onClick}
        className="relative w-full overflow-hidden text-left"
        style={{
          height,
          borderRadius: 6,
          cursor: 'pointer',
          // 未开始：半透明磨砂
          opacity: isPending ? 0.6 : 1,
          // 进行中：左边框微光
          boxShadow: isInProgress
            ? `inset 3px 0 0 ${color}, 0 0 20px rgba(0,0,0,0.4)`
            : '0 0 20px rgba(0,0,0,0.4)',
          outline: 'none',
        }}
      >
        {/* 封面照片 */}
        <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: 6 }}>
          {event.cover_photo_id ? (
            <motion.img
              src={previewUrl(event.cover_photo_id)}
              alt=""
              variants={imageVariants}
              transition={{ duration: 0.35, ease: [0.25, 0, 0, 1] }}
              className="w-full h-full object-cover"
              style={{ transformOrigin: 'center center' }}
            />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: 'var(--color-surface)' }}
            />
          )}
        </div>

        {/* 压暗遮罩 + 底部渐变（确保文字可读） */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.72) 100%)',
            borderRadius: 6,
          }}
        />

        {/* 已完成：右上角 Polaroid 角标 */}
        {isDone && (
          <div
            className="absolute top-2.5 right-2.5 z-10"
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.22)',
              padding: '3px 3px 8px 3px',
              borderRadius: 2,
              transform: 'rotate(3deg)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            }}
          >
            {event.cover_photo_id && (
              <img
                src={previewUrl(event.cover_photo_id)}
                alt=""
                style={{ width: 28, height: 28, objectFit: 'cover', display: 'block', borderRadius: 1 }}
              />
            )}
          </div>
        )}

        {/* 卡片内容（叠在照片上） */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 flex flex-col gap-1.5">
          {/* 时间 + 张数 */}
          <div className="flex items-end justify-between gap-2">
            <p
              style={{
                color: 'rgba(255,255,255,0.92)',
                fontSize: 13,
                fontWeight: 500,
                lineHeight: 1.3,
                letterSpacing: '0.01em',
              }}
            >
              {timeLabel}
            </p>
            <p
              style={{
                color: 'rgba(255,255,255,0.60)',
                fontSize: 11,
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              {event.photo_count > 1 ? `连拍 ${event.photo_count} 张` : '1 张'}
            </p>
          </div>

          {/* 地点 */}
          {event.primary_location && (
            <p
              style={{
                color: 'rgba(255,255,255,0.55)',
                fontSize: 11,
                lineHeight: 1.3,
              }}
            >
              ↟ {event.primary_location}
            </p>
          )}

          {/* 进度条 */}
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: 2, background: 'rgba(255,255,255,0.15)', marginTop: 2 }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct * 100}%`,
                background: isDone ? color : `rgba(255,255,255,0.6)`,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      </motion.button>
    </motion.div>
  )
}

// ── SiteView ─────────────────────────────────────────────────────────────────

export function SiteView() {
  const {
    selectedYear, selectedMonth,
    navigateToDecision, navigateBack,
    setEventPhotos, setMonthEvents,
  } = useAppStore()

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!selectedYear || !selectedMonth) return
    getEvents(selectedYear, selectedMonth)
      .then(({ events }) => {
        setEvents(events)
        setMonthEvents(events)
      })
      .catch((e) => setError(e.message ?? '加载失败'))
      .finally(() => setLoading(false))
  }, [selectedYear, selectedMonth, setMonthEvents])

  const handleSelectEvent = (event: Event) => {
    setEventPhotos([])
    navigateToDecision(event.id)
  }

  const color = strataColorForYear(selectedYear ?? 2021)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="px-8 py-5 flex items-center gap-4 border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-glass-border)' }}
      >
        <button
          onClick={navigateBack}
          className="transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}
        >
          ← 地层
        </button>
        <span style={{ color: 'var(--color-text-muted)' }}>/</span>
        <h2
          style={{ color, fontSize: 16, fontWeight: 500, letterSpacing: '0.04em' }}
        >
          {selectedYear}年{selectedMonth}月
        </h2>
        {events.length > 0 && (
          <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
            {events.length} 个拍摄事件
          </span>
        )}
      </div>

      {/* Masonry grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading && <LoadingState />}
        {error && (
          <p style={{ color: '#E8887A', fontSize: 13 }}>{error}</p>
        )}
        {!loading && !error && events.length === 0 && (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
            这个月没有拍摄记录
          </p>
        )}

        {/* CSS columns masonry — 3 列，自动填充 */}
        {!loading && events.length > 0 && (
          <div style={{ columns: '3 260px', columnGap: 10 }}>
            {events.map((event, i) => (
              <EventCard
                key={event.id}
                event={event}
                index={i}
                onClick={() => handleSelectEvent(event)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Loading ───────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center gap-3 py-8">
      <motion.div
        className="w-5 h-5 rounded-full border-2"
        style={{ borderColor: 'var(--strata-2022)', borderTopColor: 'transparent' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>加载拍摄事件…</p>
    </div>
  )
}
