import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getBookCandidates, previewUrl } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { strataColorForYear } from '../../utils'
import { MONTH_NAMES } from '../../i18n'
import type { BookCandidate } from '../../types'

// ── Photo card ─────────────────────────────────────────────────────────────

function BookCard({ photo, index }: { photo: BookCandidate; index: number }) {
  const { lang } = useTranslation()
  const [imgError, setImgError] = useState(false)

  const year = photo.shot_at ? new Date(photo.shot_at.replace(' ', 'T')).getFullYear() : null
  const yearColor = year ? strataColorForYear(year) : 'var(--color-text-muted)'

  const dateStr = photo.shot_at
    ? (() => {
        const d = new Date(photo.shot_at.replace(' ', 'T'))
        const m = d.getMonth() + 1
        const day = d.getDate()
        return lang === 'en'
          ? `${MONTH_NAMES.en[m]} ${day}`
          : `${m}月${day}日`
      })()
    : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.03, 0.5), ease: [0.25, 0, 0, 1] }}
      className="relative group overflow-hidden rounded-lg"
      style={{
        background: 'var(--color-glass)',
        border: '1px solid var(--color-glass-border)',
        aspectRatio: '3 / 2',
      }}
    >
      {imgError ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#1a1008' }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>{photo.file_name}</span>
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

      {/* Star badge */}
      <div
        className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#f0c060', fontSize: 10 }}
      >
        ★
      </div>

      {/* Year badge */}
      {year && (
        <div
          className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-tabular"
          style={{ background: 'rgba(0,0,0,0.55)', color: yearColor, fontSize: 10 }}
        >
          {year}
        </div>
      )}

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
          {photo.gps_city && <span style={{ opacity: 0.6 }}> · {photo.gps_city}</span>}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
          {photo.file_name}
        </p>
      </motion.div>
    </motion.div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full gap-6"
    >
      <div className="text-center" style={{ maxWidth: 300 }}>
        <p
          className="font-serif tracking-widest mb-3"
          style={{ color: '#f0c060', fontSize: 22, fontWeight: 400 }}
        >
          {t('book.empty.title')}
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {t('book.empty.hint')}
        </p>
      </div>
      <button
        onClick={onBack}
        className="text-xs px-4 py-2 rounded transition-opacity hover:opacity-70"
        style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-glass-border)' }}
      >
        {t('book.empty.back')}
      </button>
    </motion.div>
  )
}

// ── Main BookView ──────────────────────────────────────────────────────────

export function BookView() {
  const { setView } = useAppStore()
  const { t } = useTranslation()

  const [photos, setPhotos] = useState<BookCandidate[]>([])
  const [total, setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    getBookCandidates()
      .then((res) => {
        setPhotos(res.candidates)
        setTotal(res.total)
      })
      .catch((e) => setError(e.message ?? t('almanac.error')))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
              {t('book.nav.strata')}
            </button>
            <h1
              className="font-serif tracking-widest"
              style={{ color: '#f0c060', fontSize: 'var(--text-title)', fontWeight: 500, letterSpacing: '0.12em' }}
            >
              {t('book.title')}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {!loading && total > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <span>
                  <span className="font-tabular" style={{ color: '#f0c060' }}>{total}</span>
                  {' '}{t('book.stats.unit')}
                </span>
              </motion.div>
            )}
            {!loading && total > 0 && (
              <a
                href="/api/book-candidates/export?format=json"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1 rounded transition-opacity hover:opacity-80"
                style={{
                  color: 'var(--color-text-muted)',
                  border: '1px solid var(--color-glass-border)',
                }}
              >
                {t('book.export.btn')}
              </a>
            )}
          </div>
        </div>
        <div className="h-px w-full" style={{ background: 'var(--color-glass-border)' }} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <motion.div
              className="w-6 h-6 rounded-full border-2"
              style={{ borderColor: '#f0c060', borderTopColor: 'transparent' }}
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

        {!loading && !error && total === 0 && (
          <EmptyState onBack={() => setView('strata')} />
        )}

        {!loading && !error && total > 0 && (
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
              >
                {photos.map((photo, i) => (
                  <BookCard key={photo.id} photo={photo} index={i} />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
