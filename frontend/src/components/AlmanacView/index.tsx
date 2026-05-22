import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getCalendar, getTimeDistribution } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { MONTH_NAMES } from '../../i18n'
import type { CalendarDay, CalendarResult, TimeDistribution } from '../../types'

// ── Calendar heatmap ───────────────────────────────────────────────────────

function cellColor(count: number, max: number): string {
  if (count === 0) return 'rgba(255,255,255,0.04)'
  const ratio = Math.sqrt(count / Math.max(max, 1))
  // amber gradient: 0→ dim amber, 1→ bright amber
  const alpha = 0.12 + ratio * 0.7
  return `rgba(255,180,80,${alpha.toFixed(2)})`
}

function buildYearGrid(year: number, dayMap: Map<string, CalendarDay>) {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const totalDays = isLeap ? 366 : 365
  const jan1 = new Date(year, 0, 1)
  const startDow = jan1.getDay() // 0=Sun

  // Pad cells at the start so the grid aligns to Sunday columns
  const cells: Array<{ date: string | null; day: CalendarDay | null }> = []
  for (let i = 0; i < startDow; i++) cells.push({ date: null, day: null })

  for (let d = 0; d < totalDays; d++) {
    const dt = new Date(year, 0, d + 1)
    const iso = `${year}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    cells.push({ date: iso, day: dayMap.get(iso) ?? null })
  }

  // Pad to complete final week
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null })

  // Transpose: group into columns of 7 (week columns)
  const weeks: typeof cells[] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return weeks
}

function CalendarHeatmap({ data }: { data: CalendarResult }) {
  const { t, lang } = useTranslation()
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: CalendarDay; date: string } | null>(null)

  const dayMap = new Map(data.days.map((d) => [d.date, d]))
  const maxCount = Math.max(...data.days.map((d) => d.photo_count), 1)
  const weeks = buildYearGrid(data.year, dayMap)

  const DOW_LABELS = lang === 'en'
    ? ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    : ['日', '一', '二', '三', '四', '五', '六']

  // Month label positions: find first cell of each month
  const monthLabels: Array<{ weekIdx: number; label: string }> = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    week.forEach((cell) => {
      if (cell.date) {
        const m = parseInt(cell.date.split('-')[1], 10)
        if (m !== lastMonth) {
          monthLabels.push({ weekIdx: wi, label: MONTH_NAMES[lang][m] })
          lastMonth = m
        }
      }
    })
  })

  const CELL = 13
  const GAP = 2

  return (
    <div style={{ position: 'relative', overflowX: 'auto', paddingBottom: 8 }}>
      {/* Month labels */}
      <div style={{ display: 'flex', marginLeft: 20, marginBottom: 4 }}>
        {weeks.map((_, wi) => {
          const label = monthLabels.find((m) => m.weekIdx === wi)
          return (
            <div
              key={wi}
              style={{ width: CELL + GAP, flexShrink: 0, fontSize: 9, color: 'var(--color-text-muted)', userSelect: 'none' }}
            >
              {label ? label.label : ''}
            </div>
          )
        })}
      </div>

      {/* Grid: day-of-week rows × week columns */}
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Day-of-week labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, marginRight: 4 }}>
          {DOW_LABELS.map((lbl, i) => (
            <div
              key={i}
              style={{ width: 14, height: CELL, fontSize: 9, color: 'var(--color-text-muted)', lineHeight: `${CELL}px`, textAlign: 'center', userSelect: 'none' }}
            >
              {i % 2 === 0 ? lbl : ''}
            </div>
          ))}
        </div>

        {/* Week columns */}
        <div style={{ display: 'flex', gap: GAP }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
              {week.map((cell, di) => (
                <div
                  key={di}
                  onMouseEnter={(e) => {
                    if (cell.date) {
                      const rect = (e.target as HTMLElement).getBoundingClientRect()
                      setTooltip({ x: rect.left, y: rect.top, day: cell.day ?? { date: cell.date, photo_count: 0, decided_count: 0, kept_count: 0 }, date: cell.date })
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    width: CELL,
                    height: CELL,
                    borderRadius: 2,
                    background: cell.date ? cellColor(cell.day?.photo_count ?? 0, maxCount) : 'transparent',
                    cursor: cell.date && (cell.day?.photo_count ?? 0) > 0 ? 'default' : 'default',
                    transition: 'background 0.15s',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-4" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
        <span>0</span>
        {[0.1, 0.25, 0.5, 0.75, 1].map((r, i) => (
          <div
            key={i}
            style={{
              width: CELL, height: CELL, borderRadius: 2,
              background: cellColor(Math.round(r * maxCount), maxCount),
            }}
          />
        ))}
        <span>{maxCount}</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 16,
            top: tooltip.y - 8,
            zIndex: 100,
            background: 'rgba(20,14,6,0.95)',
            border: '1px solid var(--color-glass-border)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 11,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ color: 'rgba(255,255,255,0.85)', marginBottom: 3, fontFamily: 'monospace' }}>
            {tooltip.date}
          </div>
          {tooltip.day.photo_count > 0 ? (
            <>
              <div style={{ color: 'rgba(255,180,80,0.9)' }}>
                {tooltip.day.photo_count} {t('almanac.cal.tooltip.photos')}
              </div>
              <div style={{ color: 'var(--color-text-muted)' }}>
                {tooltip.day.decided_count} {t('almanac.cal.tooltip.decided')}
                {'  '}
                {tooltip.day.kept_count} {t('almanac.cal.tooltip.kept')}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--color-text-muted)' }}>{t('almanac.cal.no_photos')}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Time-of-day histogram ─────────────────────────────────────────────────

function TimeHistogram({ data }: { data: TimeDistribution }) {
  const { t, lang } = useTranslation()
  const [hovered, setHovered] = useState<number | null>(null)

  const max = data.peak_count || 1
  const BAR_W = 10
  const BAR_GAP = 2
  const CHART_H = 140

  const hourLabels: number[] = [0, 3, 6, 9, 12, 15, 18, 21]

  return (
    <div>
      {/* Peak summary */}
      <div className="flex items-center gap-3 mb-6" style={{ fontSize: 12 }}>
        <span style={{ color: 'var(--color-text-muted)' }}>{t('almanac.time.peak')}</span>
        <span className="font-tabular" style={{ color: 'rgba(255,180,80,0.9)', fontSize: 14 }}>
          {data.peak_label}
        </span>
        <span style={{ color: 'var(--color-text-muted)' }}>
          {data.peak_count.toLocaleString()} {t('almanac.cal.tooltip.photos')}
        </span>
      </div>

      {/* Bars */}
      <div style={{ position: 'relative', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: BAR_GAP, height: CHART_H, paddingBottom: 0 }}>
          {data.buckets.map((b, i) => {
            const height = Math.max(2, Math.round((b.photo_count / max) * (CHART_H - 4)))
            const isPeak = b.label === data.peak_label
            const isHover = hovered === i
            const barColor = isPeak
              ? 'rgba(255,180,80,0.85)'
              : isHover
              ? 'rgba(255,180,80,0.5)'
              : 'rgba(255,180,80,0.22)'

            return (
              <div
                key={i}
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <div
                  style={{
                    width: BAR_W,
                    height,
                    background: barColor,
                    borderRadius: '2px 2px 0 0',
                    transition: 'background 0.1s, height 0.2s',
                    cursor: 'default',
                  }}
                />
                {isHover && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: height + 4,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(20,14,6,0.95)',
                      border: '1px solid var(--color-glass-border)',
                      borderRadius: 5,
                      padding: '4px 7px',
                      fontSize: 10,
                      whiteSpace: 'nowrap',
                      zIndex: 10,
                      pointerEvents: 'none',
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace' }}>{b.label}</span>
                    <span style={{ color: 'rgba(255,180,80,0.9)', marginLeft: 5 }}>
                      {b.photo_count}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* X-axis hour labels */}
        <div style={{ display: 'flex', gap: BAR_GAP, marginTop: 4 }}>
          {data.buckets.map((b, i) => {
            const showLabel = hourLabels.includes(b.hour) && b.half === 0
            return (
              <div
                key={i}
                style={{
                  width: BAR_W,
                  fontSize: 9,
                  color: showLabel ? 'var(--color-text-muted)' : 'transparent',
                  textAlign: 'center',
                  userSelect: 'none',
                  fontFamily: 'monospace',
                }}
              >
                {showLabel ? (lang === 'en' ? `${b.hour}h` : `${b.hour}时`) : '·'}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main AlmanacView ──────────────────────────────────────────────────────

type Tab = 'calendar' | 'time'

export function AlmanacView() {
  const { setView } = useAppStore()
  const { t } = useTranslation()

  const [tab, setTab] = useState<Tab>('calendar')
  const [year] = useState(2023)

  const [calData, setCalData] = useState<CalendarResult | null>(null)
  const [timeData, setTimeData] = useState<TimeDistribution | null>(null)
  const [calLoading, setCalLoading]   = useState(true)
  const [timeLoading, setTimeLoading] = useState(false)
  const [calError, setCalError]       = useState('')
  const [timeError, setTimeError]     = useState('')

  // Calendar tab: fetch on mount
  useEffect(() => {
    getCalendar(year)
      .then(setCalData)
      .catch((e) => setCalError(e.message ?? t('almanac.error')))
      .finally(() => setCalLoading(false))
  }, [year]) // eslint-disable-line react-hooks/exhaustive-deps

  // Time tab: fetch lazily on first switch
  useEffect(() => {
    if (tab !== 'time' || timeData || timeLoading) return
    setTimeLoading(true)
    getTimeDistribution()
      .then(setTimeData)
      .catch((e) => setTimeError(e.message ?? t('almanac.error')))
      .finally(() => setTimeLoading(false))
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'calendar', label: t('almanac.tab.calendar') },
    { key: 'time',     label: t('almanac.tab.time') },
  ]

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-void)' }}>

      {/* Header */}
      <div className="px-8 pt-8 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-baseline gap-4">
            <button
              onClick={() => setView('strata')}
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t('almanac.nav.strata')}
            </button>
            <h1
              className="font-serif tracking-widest"
              style={{ color: 'var(--strata-2023)', fontSize: 'var(--text-title)', fontWeight: 500, letterSpacing: '0.12em' }}
            >
              {t('almanac.title')}
            </h1>
            <span className="font-tabular text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {year}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 pb-0">
          {tabs.map(({ key, label }) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="px-4 py-2 text-xs transition-all"
                style={{
                  borderBottom: active ? '2px solid var(--strata-2023)' : '2px solid transparent',
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  background: 'transparent',
                  letterSpacing: '0.04em',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="h-px w-full" style={{ background: 'var(--color-glass-border)' }} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">

        {tab === 'calendar' && (
          <>
            {calLoading && <Spinner />}
            {!calLoading && calError && <ErrorMsg msg={calError} />}
            {!calLoading && !calError && calData && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <CalendarHeatmap data={calData} />
                <div className="mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {calData.days.length}{' '}
                  {t('almanac.tab.calendar').toLowerCase()}{' '}
                  days · {calData.days.reduce((s, d) => s + d.photo_count, 0).toLocaleString()}{' '}
                  {t('almanac.cal.tooltip.photos')}
                </div>
              </motion.div>
            )}
          </>
        )}

        {tab === 'time' && (
          <>
            {timeLoading && <Spinner />}
            {!timeLoading && timeError && <ErrorMsg msg={timeError} />}
            {!timeLoading && !timeError && timeData && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <TimeHistogram data={timeData} />
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Shared helpers ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <motion.div
        className="w-6 h-6 rounded-full border-2"
        style={{ borderColor: 'var(--strata-2023)', borderTopColor: 'transparent' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-48">
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{msg}</p>
    </div>
  )
}
