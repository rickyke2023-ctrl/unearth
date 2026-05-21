import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getKeptPhotos, previewUrl } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { strataColorForYear, formatBytes } from '../../utils'
import type { Photo } from '../../types'

// ── Single photo card ─────────────────────────────────────────────────────

function PhotoCard({ photo, index }: { photo: Photo; index: number }) {
  const [imgError, setImgError] = useState(false)

  const dateStr = photo.shot_at
    ? (() => {
        const d = new Date(photo.shot_at.replace(' ', 'T'))
        return `${d.getMonth() + 1}月${d.getDate()}日`
      })()
    : ''

  const yearColor = strataColorForYear(photo.year)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.6), ease: [0.25, 0, 0, 1] }}
      className="relative group overflow-hidden rounded-lg"
      style={{
        background: 'var(--color-glass)',
        border: '1px solid var(--color-glass-border)',
        aspectRatio: '3 / 2',
      }}
    >
      {imgError ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: '#1a1008' }}
        >
          <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
            {photo.file_name}
          </span>
        </div>
      ) : (
        <img
          src={previewUrl(photo.id)}
          alt={photo.file_name}
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transition: 'transform 0.3s ease' }}
        />
      )}

      {/* Year badge */}
      <div
        className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-tabular"
        style={{
          background: 'rgba(0,0,0,0.55)',
          color: yearColor,
          fontSize: 10,
          letterSpacing: '0.05em',
        }}
      >
        {photo.year}
      </div>

      {/* Hover overlay */}
      <motion.div
        className="absolute inset-0 flex flex-col justify-end p-3"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)',
        }}
      >
        <p className="text-xs font-tabular" style={{ color: 'rgba(255,255,255,0.85)' }}>
          {dateStr}
          {photo.gps_city ? <span style={{ opacity: 0.6 }}> · {photo.gps_city}</span> : null}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
          {photo.file_name}
        </p>
      </motion.div>
    </motion.div>
  )
}

// ── Year section header ────────────────────────────────────────────────────

function YearHeader({ year, count }: { year: number; count: number }) {
  const color = strataColorForYear(year)
  return (
    <div className="flex items-baseline gap-3 pt-2 pb-3">
      <h2
        className="font-serif"
        style={{ color, fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em' }}
      >
        {year}
      </h2>
      <span className="text-xs font-tabular" style={{ color: 'var(--color-text-muted)' }}>
        {count} 张
      </span>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full gap-6"
    >
      <div className="text-center" style={{ maxWidth: 280 }}>
        <p
          className="font-serif tracking-widest mb-3"
          style={{ color: 'var(--strata-2022)', fontSize: 22, fontWeight: 400 }}
        >
          行囊还是空的
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          开始挖掘，把值得带走的记忆放进来。
        </p>
      </div>
      <button
        onClick={onBack}
        className="text-xs px-4 py-2 rounded transition-opacity hover:opacity-70"
        style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-glass-border)' }}
      >
        ← 回到地层
      </button>
    </motion.div>
  )
}

// ── Main KeptView ──────────────────────────────────────────────────────────

export function KeptView() {
  const { setView } = useAppStore()

  const [photos, setPhotos]         = useState<Photo[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [byYear, setByYear]         = useState<Record<string, number>>({})
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  const fetchPhotos = (year?: number) => {
    setLoading(true)
    getKeptPhotos({ limit: 200, year })
      .then((res) => {
        setPhotos(res.photos)
        setTotalCount(res.total_count)
        setByYear(res.by_year)
      })
      .catch((e) => setError(e.message ?? '加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPhotos() }, [])

  const handleYearSelect = (year: number | null) => {
    setSelectedYear(year)
    fetchPhotos(year ?? undefined)
  }

  // Group photos by year for display (when showing all years)
  const grouped: Array<{ year: number; photos: Photo[] }> = selectedYear
    ? [{ year: selectedYear, photos }]
    : Object.keys(byYear)
        .map(Number)
        .sort((a, b) => b - a)
        .map((year) => ({
          year,
          photos: photos.filter((p) => p.year === year),
        }))
        .filter((g) => g.photos.length > 0)

  // Total size of shown photos
  const totalBytes = photos.reduce((sum, p) => sum + (p.file_size_bytes ?? 0), 0)

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
              ← 地层
            </button>
            <h1
              className="font-serif tracking-widest"
              style={{
                color: 'var(--strata-2022)',
                fontSize: 'var(--text-title)',
                fontWeight: 500,
                letterSpacing: '0.12em',
              }}
            >
              带走的记忆
            </h1>
          </div>

          {/* Stats pill */}
          {!loading && totalCount > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <span>
                <span className="font-tabular" style={{ color: 'var(--color-keep)' }}>
                  {totalCount}
                </span>{' '}
                张带走
              </span>
              <span style={{ opacity: 0.35 }}>·</span>
              <span className="font-tabular">{formatBytes(totalBytes)}</span>
            </motion.div>
          )}
        </div>

        {/* Year filter tabs */}
        {!loading && Object.keys(byYear).length > 1 && (
          <div className="flex gap-2 pb-5">
            <button
              onClick={() => handleYearSelect(null)}
              className="px-3 py-1 rounded text-xs transition-all"
              style={{
                background: selectedYear === null ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: selectedYear === null ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                border: `1px solid ${selectedYear === null ? 'rgba(255,255,255,0.18)' : 'transparent'}`,
              }}
            >
              全部
            </button>
            {Object.keys(byYear)
              .map(Number)
              .sort((a, b) => b - a)
              .map((year) => {
                const color = strataColorForYear(year)
                const active = selectedYear === year
                return (
                  <button
                    key={year}
                    onClick={() => handleYearSelect(year)}
                    className="px-3 py-1 rounded text-xs transition-all font-tabular"
                    style={{
                      background: active ? `${color}22` : 'transparent',
                      color: active ? color : 'var(--color-text-muted)',
                      border: `1px solid ${active ? color + '55' : 'transparent'}`,
                    }}
                  >
                    {year} · {byYear[String(year)]}
                  </button>
                )
              })}
          </div>
        )}

        <div className="h-px w-full" style={{ background: 'var(--color-glass-border)' }} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <motion.div
              className="w-6 h-6 rounded-full border-2"
              style={{ borderColor: 'var(--strata-2022)', borderTopColor: 'transparent' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center justify-center h-full">
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{error}</p>
          </div>
        )}

        {!loading && !error && totalCount === 0 && (
          <EmptyState onBack={() => setView('strata')} />
        )}

        {!loading && !error && totalCount > 0 && (
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedYear ?? 'all'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {grouped.map(({ year, photos: yearPhotos }) => (
                <div key={year} className="mb-10">
                  <YearHeader year={year} count={yearPhotos.length} />
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
                  >
                    {yearPhotos.map((photo, i) => (
                      <PhotoCard key={photo.id} photo={photo} index={i} />
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

    </div>
  )
}
