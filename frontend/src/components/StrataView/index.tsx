import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getStrata, getStaging, getTrash } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { formatBytes, strataColorForYear } from '../../utils'
import { MONTH_NAMES } from '../../i18n'
import type { StrataYear, MonthSummary, GlobalStats } from '../../types'

// ── Month bar — 宽度 ∝ 照片数量 ─────────────────────────────────────────────

function MonthBar({ month, yearColor }: { month: MonthSummary; yearColor: string }) {
  const { navigateToSite } = useAppStore()
  const { t, lang } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const pct = month.photo_count > 0 ? month.decided_count / month.photo_count : 0
  const isDone = month.status === 'completed'

  const countLabel =
    month.photo_count >= 1000
      ? `${(month.photo_count / 1000).toFixed(1)}k`
      : String(month.photo_count)

  const monthNames = MONTH_NAMES[lang]

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
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            {monthNames[month.month]}
          </p>
          <p
            style={{
              color: isDone ? 'rgba(10,10,15,0.52)' : 'var(--color-text-muted)',
              fontSize: 14,
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
            {lang === 'en'
              ? `${monthNames[month.month]} ${month.year}`
              : `${month.year}年${month.month}月`}
          </p>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {month.photo_count.toLocaleString()} {t('month.tooltip.photos')}
            {' · '}
            {month.event_count} {t('month.tooltip.events')}
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
  const { lang } = useTranslation()
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
      style={{ minHeight: 200 }}
    >
      {/* Year label — fixed 72px column, vertically centered */}
      <div
        className="flex-shrink-0 flex flex-col justify-center"
        style={{ width: 72 }}
      >
        <p
          style={{
            color,
            fontSize: 28,
            fontWeight: 500,
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
          }}
        >
          {year.year}
        </p>
        <p
          className="font-tabular"
          style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 5 }}
        >
          {decidedPct}%
        </p>
        <p
          style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 2 }}
        >
          {lang === 'en' ? totalLabel : `${totalLabel}张`}
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

function GlobalStatsBar({ stats, stagingCount, trashCount }: { stats: GlobalStats; stagingCount: number; trashCount: number }) {
  const { setShowStagingDialog, setView } = useAppStore()
  const { t } = useTranslation()
  const decidedPct =
    stats.total_photos > 0 ? Math.round((stats.decided_count / stats.total_photos) * 100) : 0

  return (
    <div
      className="flex items-center justify-between py-4 border-b"
      style={{ borderColor: 'var(--color-glass-border)' }}
    >
      <div className="flex gap-8 font-tabular" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        <span>
          <span style={{ color: 'var(--color-text-primary)' }}>{stats.total_photos.toLocaleString()}</span>
        </span>
        <span>
          {stats.kept_count > 0 ? (
            <button
              onClick={() => setView('kept')}
              className="transition-opacity hover:opacity-70"
              style={{ color: 'inherit' }}
            >
              {t('stats.carried')} <span style={{ color: 'var(--color-keep)' }}>{stats.kept_count.toLocaleString()}</span> →
            </button>
          ) : (
            <>{t('stats.carried')} <span style={{ color: 'var(--color-keep)' }}>0</span></>
          )}
        </span>
        <span>
          {t('stats.left')} <span style={{ color: 'var(--color-leave)' }}>{stats.left_count.toLocaleString()}</span>
        </span>
        <span>
          {t('stats.freed')} <span style={{ color: 'var(--color-keep)' }}>{formatBytes(stats.freed_bytes)}</span>
        </span>
        <span>
          {t('stats.progress')} <span style={{ color: 'var(--color-text-primary)' }}>{decidedPct}%</span>
        </span>
      </div>
      {(stagingCount > 0 || trashCount > 0) && (
        <button
          onClick={() => setShowStagingDialog(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 12 }}
        >
          {stagingCount > 0 && (
            <span style={{ color: 'var(--color-leave)' }}>
              {t('stats.pending')} <span className="font-tabular">{stagingCount}</span>
            </span>
          )}
          {stagingCount > 0 && trashCount > 0 && (
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
          )}
          {trashCount > 0 && (
            <span style={{ color: 'var(--color-text-muted)' }}>
              {t('stats.trash')} <span className="font-tabular">{trashCount}</span>
            </span>
          )}
        </button>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function StrataView() {
  const { setView, language, setLanguage } = useAppStore()
  const { t } = useTranslation()
  const [years, setYears] = useState<StrataYear[]>([])
  const [stats, setStats] = useState<GlobalStats | null>(null)
  const [stagingCount, setStagingCount] = useState(0)
  const [trashCount, setTrashCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getStrata(), getStaging(), getTrash()])
      .then(([strataData, stagingData, trashData]) => {
        setYears(strataData.years)
        setStats(strataData.global_stats)
        setStagingCount(stagingData.total_count)
        setTrashCount(trashData.total_count)
      })
      .catch((e) => setError(e.message ?? t('strata.error.title')))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-baseline gap-4">
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
              {t('app.subtitle')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <button
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="text-xs px-2.5 py-1 rounded transition-opacity hover:opacity-80"
              style={{
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-glass-border)',
                letterSpacing: '0.04em',
                fontFamily: 'monospace',
              }}
            >
              {language === 'zh' ? 'EN' : '中'}
            </button>

            {/* 故事入口 */}
            <motion.button
              onClick={() => setView('story')}
              whileHover={{ scale: 1.03, opacity: 1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs tracking-wider"
              style={{
                background: 'rgba(126,184,164,0.08)',
                border: '1px solid rgba(126,184,164,0.25)',
                color: 'rgba(126,184,164,0.75)',
                opacity: 0.9,
              }}
            >
              <span style={{ fontSize: 14 }}>◎</span>
              {t('story.button')}
            </motion.button>

            {/* 今日发掘入口 */}
            <motion.button
              onClick={() => setView('excavation')}
              whileHover={{ scale: 1.03, opacity: 1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs tracking-wider"
              style={{
                background: 'rgba(255,180,80,0.08)',
                border: '1px solid rgba(255,180,80,0.25)',
                color: 'rgba(255,180,80,0.75)',
                opacity: 0.9,
              }}
            >
              <span style={{ fontSize: 14 }}>⛏</span>
              {t('excavation.button')}
            </motion.button>
          </div>
        </div>
        {stats && <GlobalStatsBar stats={stats} stagingCount={stagingCount} trashCount={trashCount} />}
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
  const { t } = useTranslation()
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <motion.div
          className="w-8 h-8 rounded-full border-2"
          style={{ borderColor: 'var(--strata-2022)', borderTopColor: 'transparent' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{t('strata.loading')}</p>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  const { t } = useTranslation()
  return (
    <div className="h-full flex items-center justify-center">
      <div className="glass rounded-lg p-8 max-w-sm text-center">
        <p style={{ color: '#E8887A', fontSize: 13, marginBottom: 8 }}>{t('strata.error.title')}</p>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{message}</p>
      </div>
    </div>
  )
}
