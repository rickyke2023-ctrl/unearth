import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getStrata, getStaging } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { formatBytes, strataColorForYear } from '../../utils'
import type { StrataYear, MonthSummary, GlobalStats } from '../../types'

const MONTH_NAMES = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function MonthBlock({ month, yearColor }: { month: MonthSummary; yearColor: string }) {
  const { navigateToSite } = useAppStore()
  const [hovered, setHovered] = useState(false)
  const pct = month.photo_count > 0 ? month.decided_count / month.photo_count : 0
  const isDone = month.status === 'completed'

  return (
    <div className="relative">
      <motion.button
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        onClick={() => navigateToSite(month.year, month.month)}
        className="relative flex flex-col justify-end rounded-sm overflow-hidden cursor-pointer transition-all"
        style={{
          width: 56,
          height: 72,
          background: isDone ? yearColor : 'var(--color-glass)',
          border: `1px solid ${isDone ? 'transparent' : 'var(--color-glass-border)'}`,
          filter: isDone ? 'none' : 'blur(0px)',
          opacity: isDone ? 1 : 0.55,
        }}
        whileHover={{ scale: 1.06, opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        {/* Progress fill */}
        {!isDone && pct > 0 && (
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{ height: `${pct * 100}%`, background: yearColor, opacity: 0.4 }}
          />
        )}
        {isDone && (
          <>
            <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.08)' }} />
            {/* Breathing glow for completed months */}
            <motion.div
              className="absolute inset-0 rounded-sm pointer-events-none"
              animate={{ opacity: [0.08, 0.2, 0.08] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ background: yearColor }}
            />
          </>
        )}
        <div className="relative z-10 p-1.5">
          <p className="text-xs font-tabular" style={{ color: isDone ? 'rgba(10,10,15,0.7)' : 'var(--color-text-secondary)', fontSize: 10 }}>
            {MONTH_NAMES[month.month]}
          </p>
          <p className="text-xs font-tabular" style={{ color: isDone ? 'rgba(10,10,15,0.5)' : 'var(--color-text-muted)', fontSize: 9 }}>
            {month.photo_count > 999 ? `${(month.photo_count / 1000).toFixed(1)}k` : month.photo_count}
          </p>
        </div>
      </motion.button>

      {hovered && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute z-50 glass rounded px-3 py-2 text-xs whitespace-nowrap"
          style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 }}
        >
          <p className="font-light tracking-wide">{month.year}年{month.month}月</p>
          <p style={{ color: 'var(--color-text-secondary)' }}>{month.photo_count.toLocaleString()} 张照片 · {month.event_count} 个事件</p>
          {month.primary_locations.length > 0 && (
            <p style={{ color: 'var(--color-text-muted)' }}>{month.primary_locations.join(' · ')}</p>
          )}
        </motion.div>
      )}
    </div>
  )
}

function YearStratum({ year }: { year: StrataYear }) {
  const color = strataColorForYear(year.year)
  const decidedPct = year.total_photos > 0 ? Math.round(year.decided_count / year.total_photos * 100) : 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-start gap-6"
    >
      {/* Year label */}
      <div className="w-16 pt-4 flex-shrink-0 text-right">
        <p className="text-lg font-light" style={{ color }}>{year.year}</p>
        <p className="text-xs font-tabular" style={{ color: 'var(--color-text-muted)' }}>{decidedPct}%</p>
      </div>

      {/* Stratum bar */}
      <div className="flex-1 relative">
        {/* Color accent line */}
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full" style={{ background: color, opacity: 0.6 }} />

        <div className="pl-4">
          <div className="flex flex-wrap gap-2 py-2">
            {year.months.map((m) => (
              <MonthBlock key={`${m.year}-${m.month}`} month={m} yearColor={color} />
            ))}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {year.total_photos.toLocaleString()} 张 · {formatBytes(year.total_size_bytes)}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function GlobalStatsBar({ stats, stagingCount }: { stats: GlobalStats; stagingCount: number }) {
  const { setShowStagingDialog } = useAppStore()
  const decidedPct = stats.total_photos > 0 ? Math.round(stats.decided_count / stats.total_photos * 100) : 0

  return (
    <div className="flex items-center justify-between py-4 border-b" style={{ borderColor: 'var(--color-glass-border)' }}>
      <div className="flex gap-8 text-xs font-tabular">
        <span style={{ color: 'var(--color-text-secondary)' }}>
          <span style={{ color: 'var(--color-text-primary)' }}>{stats.total_photos.toLocaleString()}</span> 张
        </span>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          带走 <span style={{ color: 'var(--color-keep)' }}>{stats.kept_count.toLocaleString()}</span>
        </span>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          留下 <span style={{ color: 'var(--color-leave)' }}>{stats.left_count.toLocaleString()}</span>
        </span>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          已释放 <span style={{ color: 'var(--color-keep)' }}>{formatBytes(stats.freed_bytes)}</span>
        </span>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          进度 <span style={{ color: 'var(--color-text-primary)' }}>{decidedPct}%</span>
        </span>
      </div>
      {stagingCount > 0 && (
        <button
          onClick={() => setShowStagingDialog(true)}
          className="text-xs px-3 py-1.5 rounded transition-opacity hover:opacity-70"
          style={{ background: 'var(--color-leave)', color: '#fff' }}
        >
          确认释放空间
          <span className="ml-1.5 opacity-70">({stagingCount})</span>
        </button>
      )}
    </div>
  )
}

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
      <div className="px-8 pt-8 pb-0">
        <div className="flex items-baseline gap-4 mb-6">
          <h1 className="text-xl font-light tracking-widest" style={{ color: 'var(--strata-2022)' }}>
            显影 · Unearth
          </h1>
          <span className="text-xs tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
            A Memory Excavation
          </span>
        </div>
        {stats && <GlobalStatsBar stats={stats} stagingCount={stagingCount} />}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-8 max-w-3xl">
          {years.map((year) => (
            <YearStratum key={year.year} year={year} />
          ))}
        </div>
      </div>
    </div>
  )
}

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
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>加载地层中…</p>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="glass rounded-lg p-8 max-w-sm text-center">
        <p className="text-sm mb-2" style={{ color: '#E8887A' }}>加载失败</p>
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{message}</p>
      </div>
    </div>
  )
}
