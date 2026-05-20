import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getEvents } from '../../api'
import { previewUrl } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { formatTime, strataColorForYear } from '../../utils'
import type { Event } from '../../types'

const STATUS_LABEL: Record<string, string> = {
  pending: '未开始',
  in_progress: '进行中',
  completed: '已完成',
}

function EventCard({ event, onClick }: { event: Event; onClick: () => void }) {
  const color = strataColorForYear(event.year)
  const pct = event.photo_count > 0 ? event.decided_count / event.photo_count : 0

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="glass rounded-lg overflow-hidden text-left w-full flex gap-4 cursor-pointer"
      style={{ padding: 0 }}
    >
      {/* Cover thumbnail */}
      <div
        className="flex-shrink-0 w-24 h-24 relative overflow-hidden"
        style={{ background: 'var(--color-surface)' }}
      >
        {event.cover_photo_id ? (
          <img
            src={previewUrl(event.cover_photo_id)}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span style={{ color: 'var(--color-text-muted)', fontSize: 24 }}>□</span>
          </div>
        )}
        {/* Status dot */}
        <div
          className="absolute top-2 right-2 w-2 h-2 rounded-full"
          style={{
            background: event.status === 'completed' ? 'var(--color-keep)'
              : event.status === 'in_progress' ? color
              : 'var(--color-text-muted)',
          }}
        />
      </div>

      {/* Info */}
      <div className="flex-1 py-3 pr-4 flex flex-col justify-between min-w-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-1.5 py-0.5 rounded" style={{
              background: 'var(--color-glass)',
              color: event.status === 'completed' ? 'var(--color-keep)'
                : event.status === 'in_progress' ? color
                : 'var(--color-text-muted)',
              fontSize: 10,
            }}>
              {STATUS_LABEL[event.status]}
            </span>
            {event.primary_location && (
              <span className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                {event.primary_location}
              </span>
            )}
          </div>
          <p className="text-sm font-light">
            {formatTime(event.started_at)}
            {event.ended_at !== event.started_at && <> — {formatTime(event.ended_at)}</>}
            {event.photo_count > 1 && (
              <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                · {event.photo_count > 1 ? `连拍系列 ${event.photo_count} 张` : ''}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs font-tabular" style={{ color: 'var(--color-text-secondary)' }}>
            {event.photo_count} 张 · {event.decided_count} 已决定
          </span>
          {/* Progress bar */}
          <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--color-glass)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${pct * 100}%`, background: color }}
            />
          </div>
        </div>
      </div>
    </motion.button>
  )
}

export function SiteView() {
  const { selectedYear, selectedMonth, navigateToDecision, navigateBack, setEventPhotos, setMonthEvents } = useAppStore()
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
        className="px-8 py-5 flex items-center gap-4 border-b"
        style={{ borderColor: 'var(--color-glass-border)' }}
      >
        <button
          onClick={navigateBack}
          className="text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ← 地层
        </button>
        <span style={{ color: 'var(--color-text-muted)' }}>/</span>
        <h2 className="text-sm font-light tracking-widest" style={{ color }}>
          {selectedYear}年{selectedMonth}月
        </h2>
        {events.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {events.length} 个拍摄事件
          </span>
        )}
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading && <LoadingState />}
        {error && <p className="text-sm" style={{ color: '#E8887A' }}>{error}</p>}
        {!loading && !error && events.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            这个月没有拍摄记录
          </p>
        )}
        <div className="flex flex-col gap-3 max-w-2xl">
          {events.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <EventCard event={event} onClick={() => handleSelectEvent(event)} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center gap-3 py-8">
      <motion.div
        className="w-5 h-5 rounded-full border-2"
        style={{ borderColor: 'var(--strata-2022)', borderTopColor: 'transparent' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>加载拍摄事件…</p>
    </div>
  )
}
