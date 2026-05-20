import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getStrata, getStaging } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { formatBytes, strataColorForYear } from '../../utils'
import type { StrataYear, MonthSummary, GlobalStats } from '../../types'

const MONTH_NAMES = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

// ── Month bar — 宽度 ∝ 照片数量 ─────────────────────────────────────────────

function MonthBar({ month, yearColor }: { month: MonthSummary; yearColor: string }) {
  const { navigateToSite } = useAppStore()
  const [hovered, setHovered] = useState(false)
  const pct = month.photo_count > 0 ? month.decided_count / month.photo_count : 0
  const isDone = month.status === 'completed'

  const countLabel =
    month.photo_count >= 1000
      ? `${(month.photo_count / 1000).toFixed(1)}k`
      : String(month.photo_count)

  return (
    // flex value drives proportional width; min-width so tiny months are still clickable
    <div
      className="relative"
      style={{ flex: month.photo_count, minWidth: 44 }}
    >
      <motion.button
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        onClick={() => navigateToSite(month.year, month.month)}
        className="relative w-full h-full flex flex-col justify-end overflow-hidden"
        style={{
          padding: '10px 10px 12px',
          borderRadius: 4,
          background: isDone ? yearColor : 'var(--color-glass)',
          border: `1px solid ${isDone ? 'transparent' : 'var(--color-glass-border)'}`,
          opacity: isDone ? 1 : 0.5,
          cursor: 'pointer',
        }}
        whileHover={{ opacity: 1, scale: 1.015 }}
        transition={{ duration: 0.15, ease: [0.25, 0, 0, 1] }}
      >
        {/* Progress fill for in-progress months */}
        {!isDone && pct > 0 && (
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{ height: `${pct * 100}%`, background: yearColor, opacity: 0.35 }}
          />
        )}

        {/* Completed: shimmer overlay + breathing glow */}
        {isDone && (
          <>
            <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <motion.div
              className="absolute inset-0 pointer-events-none"
              animate={{ opacity: [0.06, 0.2, 0.06] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ background: yearColor }}
            />
          </>
        )}

        {/* Month label + count */}
        <div className="relative z-10">
          <p
            style={{
              color: isDone ? 'rgba(10,10,15,0.78)' : 'var(--color-text-secondary)',
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            {MONTH_NAMES[month.month]}
          </p>
          <p
            style={{
              color: isDone ? 'rgba(10,10,15,0.52)' : 'var(--color-text-muted)',
              fontSize: 11,
              lineHeight: 1.3,
              marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {countLabel}
          </p>
        </div>
      </motion.button>

      {/* Hover tooltip */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="absolute z-50 glass rounded-lg px-3 py-2 text-xs whitespace-nowrap pointer-events-none"
          style={{ bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }}
        >
          <p style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
            {month.year}年{month.month}月
          </p>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {month.photo_count.toLocaleString()} 张 · {month.event_count} 个事件
          </p>
          {month.primary_locations.length > 0 && (
            <p style={{ color: 'var(--color-text-muted)', marginTop: 2 }}>
              {month.primary_locations.join(' · ')}
            </p>
          )}
        </motion.div>
      )}
    </div>
  )
}

// ── Year stratum — full-width horizontal band ────────────────────────────────

function YearStratum({ year, index }: { year: StrataYear; index: number }) {
  const color = strataColorForYear(year.year)
  const decidedPct =
    year.total_photos > 0 ? Math.round((year.decided_count / year.total_photos) * 100) : 0
  const totalLabel =
    year.total_photos >= 1000
      ? `${(year.total_photos / 1000).toFixed(1)}k`
      : String(year.total_photos)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.25, 0, 0, 1] }}
      className="flex gap-5"
      style={{ minHeight: 120 }}
    >
      {/* Year label — fixed 72px column, vertically centered */}
      <div
        className="flex-shrink-0 flex flex-col justify-center"
        style={{ width: 72 }}
      >
        <p
          style={{
            color,
            fontSize: 'var(--text-title)',   /* 22px */
            fontWeight: 500,
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
          }}
        >
          {year.year}
        </p>
        <p
          className="font-tabular"
          style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 5 }}
        >
          {decidedPct}%
        </p>
        <p
          style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 2 }}
        >
          {totalLabel}张
        </p>
      </div>

      {/* Month bars — fills remaining width, proportional to photo count */}
      <div className="flex flex-1 gap-1" style={{ alignItems: 'stretch' }}>
        {year.months.map((m) => (
          <MonthBar key={`${m.year}-${m.month}`} month={m} yearColor={color} />
        ))}
      </div>
    </motion.div>
  )
}

// ── Global stats bar ─────────────────────────────────────────────────────────

function GlobalStatsBar({ stats, stagingCount }: { stats: GlobalStats; stagingCount: number }) {
  const { setShowStagingDialog } = useAppStore()
  const decidedPct =
    stats.total_photos > 0 ? Math.round((stats.decided_count / stats.total_photos) * 100) : 0

  return (
    <div
      className="flex items-center justify-between py-4 border-b"
      style={{ borderColor: 'var(--color-glass-border)' }}
    >
      <div className="flex gap-8 font-tabular" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        <span>
          <span style={{ color: 'var(--color-text-primary)' }}>{stats.total_photos.toLocaleString()}</span> 张
        </span>
        <span>
          带走 <span style={{ color: 'var(--color-keep)' }}>{stats.kept_count.toLocaleString()}</span>
        </span>
        <span>
          留下 <span style={{ color: 'var(--color-leave)' }}>{stats.left_count.toLocaleString()}</span>
        </span>
        <span>
          已释放 <span style={{ color: 'var(--color-keep)' }}>{formatBytes(stats.freed_bytes)}</span>
        </span>
        <span>
          进度 <span style={{ color: 'var(--color-text-primary)' }}>{decidedPct}%</span>
        </span>
      </div>
      {stagingCount > 0 && (
        <button
          onClick={() => setShowStagingDialog(true)}
          className="text-xs px-3 py-1.5 rounded transition-opacity hover:opacity-70"
          style={{ background: 'var(--color-leave)', color: '#fff', fontSize: 13 }}
        >
          确认释放空间
          <span className="ml-1.5 opacity-70">({stagingCount})</span>
        </button>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function StrataView() {
  const [years, setYears] = useState<StrataYear[]>([])
  const [stats, setStats] = useState<GlobalStats | null>(null)
  const [stagingCount, setStagingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getStrata(), getStaging()])
      .then(([strataData, stagingData]) => {
        setYears(strataData.years)
        setStats(strataData.global_stats)
        setStagingCount(stagingData.total_count)
      })
      .catch((e) => setError(e.message ?? '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-0 flex-shrink-0">
        <div className="flex items-baseline gap-4 mb-6">
          <h1
            className="font-serif tracking-widest"
            style={{
              color: 'var(--strata-2022)',
              fontSize: 'var(--text-title)',
              fontWeight: 500,
              letterSpacing: '0.12em',
            }}
          >
            显影 · Unearth
          </h1>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 12, letterSpacing: '0.08em' }}>
            A Memory Excavation
          </span>
        </div>
        {stats && <GlobalStatsBar stats={stats} stagingCount={stagingCount} />}
      </div>

      {/* Strata — full width, no max-width cap */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="flex flex-col gap-5">
          {years.map((year, i) => (
            <YearStratum key={year.year} year={year} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Loading / Error ───────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <motion.div
          className="w-8 h-8 rounded-full border-2"
          style={{ borderColor: 'var(--strata-2022)', borderTopColor: 'transparent' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>加载地层中…</p>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="glass rounded-lg p-8 max-w-sm text-center">
        <p style={{ color: '#E8887A', fontSize: 13, marginBottom: 8 }}>加载失败</p>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{message}</p>
      </div>
    </div>
  )
}
