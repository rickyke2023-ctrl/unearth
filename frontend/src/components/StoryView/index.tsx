import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getStoryToday, getStoryThemes, getThemeDetail, previewUrl } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { strataColorForYear } from '../../utils'
import type { FullDayStory, StoryPhoto, Theme, ThemeDetail, StoryThemes } from '../../types'

// ── Shared photo card ──────────────────────────────────────────────────────

function StoryPhotoCard({ photo, index }: { photo: StoryPhoto; index: number }) {
  const [err, setErr] = useState(false)
  const color = strataColorForYear(photo.year)
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.5) }}
      className="relative overflow-hidden rounded-lg flex-shrink-0"
      style={{
        aspectRatio: '3/2',
        background: 'var(--color-glass)',
        border: '1px solid var(--color-glass-border)',
      }}
    >
      {err ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#120d05' }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>{photo.filename}</span>
        </div>
      ) : (
        <img
          src={previewUrl(photo.photo_id)}
          alt={photo.filename}
          onError={() => setErr(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {/* Year badge */}
      <div
        className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-tabular"
        style={{ background: 'rgba(0,0,0,0.55)', color, fontSize: 10 }}
      >
        {photo.year}
      </div>
      {/* Hover: date + location */}
      <motion.div
        className="absolute inset-0 flex flex-col justify-end p-2"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)' }}
      >
        {photo.shot_at && (
          <p className="text-xs font-tabular" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10 }}>
            {photo.shot_at.slice(11, 16)}
            {photo.gps_city ? <span style={{ opacity: 0.55 }}> · {photo.gps_city}</span> : null}
          </p>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Time segments bar ──────────────────────────────────────────────────────

function TimeBar({ segments, total }: { segments: FullDayStory['time_segments']; total: number }) {
  const { t } = useTranslation()
  const parts = [
    { key: 'morning',   label: t('story.time.morning'),   count: segments.morning,   color: '#d4a050' },
    { key: 'afternoon', label: t('story.time.afternoon'), count: segments.afternoon, color: '#7eb8a4' },
    { key: 'evening',   label: t('story.time.evening'),   count: segments.evening,   color: '#9378c8' },
    { key: 'night',     label: t('story.time.night'),     count: segments.night,     color: '#4a6fa5' },
  ]
  return (
    <div className="flex items-center gap-1 mt-1 mb-4">
      {parts.map(({ key, label, count, color }) =>
        count > 0 ? (
          <div key={key} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            <span className="text-xs font-tabular" style={{ color: 'var(--color-text-muted)' }}>
              {count}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)', opacity: 0.5, marginRight: 6 }}>
              {label}
            </span>
          </div>
        ) : null,
      )}
      <span className="text-xs font-tabular ml-auto" style={{ color: 'var(--color-text-muted)', opacity: 0.4 }}>
        {total}
      </span>
    </div>
  )
}

// ── Full-day story panel ───────────────────────────────────────────────────

function FullDayPanel({ story }: { story: FullDayStory }) {
  const { t, lang } = useTranslation()
  const color = strataColorForYear(story.year)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full"
    >
      {/* Story header */}
      <div className="mb-4">
        <p className="text-xs tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>
          {t('story.today.label')}
        </p>
        <h2
          className="font-serif"
          style={{ color, fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em' }}
        >
          {story.subtitle}
        </h2>
        <TimeBar segments={story.time_segments} total={story.total_count} />
      </div>

      {/* Photo grid */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ minHeight: 0 }}
      >
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
        >
          {story.photos.map((photo, i) => (
            <StoryPhotoCard key={photo.photo_id} photo={photo} index={i} />
          ))}
        </div>

        {story.total_count > story.photos.length && (
          <p
            className="text-xs text-center mt-4"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t('story.showing')} {story.photos.length} / {story.total_count}
          </p>
        )}
      </div>
    </motion.div>
  )
}

// ── Empty GPS state ────────────────────────────────────────────────────────

function NoGpsState() {
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full gap-4 text-center"
      style={{ padding: '0 40px' }}
    >
      <p
        className="font-serif tracking-widest"
        style={{ color: 'var(--strata-2022)', fontSize: 22, fontWeight: 400 }}
      >
        {t('story.places.empty.title')}
      </p>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)', maxWidth: 260 }}>
        {t('story.places.empty.hint')}
      </p>
    </motion.div>
  )
}

// ── Place card ─────────────────────────────────────────────────────────────

function PlaceCard({ theme, index, onClick }: { theme: Theme; index: number; onClick: () => void }) {
  const [err, setErr] = useState(false)
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.6) }}
      onClick={onClick}
      className="relative overflow-hidden rounded-xl text-left group"
      style={{
        aspectRatio: '4/3',
        background: 'var(--color-glass)',
        border: '1px solid var(--color-glass-border)',
      }}
    >
      {/* Cover image */}
      {theme.cover_photo_id && !err ? (
        <img
          src={previewUrl(theme.cover_photo_id)}
          alt={theme.label}
          onError={() => setErr(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 40% 60%, rgba(120,80,30,0.3) 0%, transparent 70%)' }}
        />
      )}

      {/* Bottom overlay */}
      <div
        className="absolute inset-0 flex flex-col justify-end p-4"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)' }}
      >
        <p className="font-serif text-sm" style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 500 }}>
          {theme.label}
        </p>
        <p className="text-xs mt-0.5 font-tabular" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {theme.photo_count}
        </p>
      </div>
    </motion.button>
  )
}

// ── Places grid ────────────────────────────────────────────────────────────

function PlacesPanel({
  themesData,
  onSelectTheme,
}: {
  themesData: StoryThemes
  onSelectTheme: (themeId: string) => void
}) {
  const { t } = useTranslation()

  if (themesData.photos_with_gps === 0) return <NoGpsState />

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="font-tabular" style={{ color: 'var(--color-keep)' }}>
            {themesData.photos_with_gps}
          </span>{' '}
          {t('story.places.gps_count')}
        </p>
        {themesData.photos_without_gps > 0 && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>
            {themesData.photos_without_gps} {t('story.places.no_gps')}
          </p>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ minHeight: 0 }}
      >
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
        >
          {themesData.themes.map((theme, i) => (
            <PlaceCard
              key={theme.theme_id}
              theme={theme}
              index={i}
              onClick={() => onSelectTheme(theme.theme_id)}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ── Theme detail view ──────────────────────────────────────────────────────

function ThemeDetailPanel({
  detail,
  onBack,
}: {
  detail: ThemeDetail
  onBack: () => void
}) {
  const { t } = useTranslation()
  const years = Object.keys(detail.photos_by_year).map(Number).sort((a, b) => b - a)

  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-5 flex items-start gap-4">
        <button
          onClick={onBack}
          className="text-xs transition-opacity hover:opacity-70 mt-1"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ← {t('story.places.label')}
        </button>
        <div>
          <h2
            className="font-serif"
            style={{ color: 'var(--strata-2022)', fontSize: 24, fontWeight: 500 }}
          >
            {detail.label}
          </h2>
          <p className="text-xs mt-0.5 font-tabular" style={{ color: 'var(--color-text-muted)' }}>
            {detail.total_count} {t('story.places.photo_count_unit')}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {years.map((year) => {
          const photos = detail.photos_by_year[String(year)] ?? []
          const color = strataColorForYear(year)
          return (
            <div key={year} className="mb-8">
              <div className="flex items-baseline gap-3 pb-3">
                <h3 className="font-serif" style={{ color, fontSize: 20, fontWeight: 500 }}>
                  {year}
                </h3>
                <span className="text-xs font-tabular" style={{ color: 'var(--color-text-muted)' }}>
                  {photos.length}
                </span>
              </div>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
              >
                {photos.map((photo, i) => (
                  <StoryPhotoCard key={photo.photo_id} photo={photo} index={i} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

// ── Main StoryView ─────────────────────────────────────────────────────────

type Tab = 'today' | 'places'

export function StoryView() {
  const { setView } = useAppStore()
  const { t } = useTranslation()

  const [tab, setTab]                 = useState<Tab>('today')
  const [fullDay, setFullDay]         = useState<FullDayStory | null>(null)
  const [themes, setThemes]           = useState<StoryThemes | null>(null)
  const [detail, setDetail]           = useState<ThemeDetail | null>(null)
  const [loadingToday, setLoadingToday] = useState(true)
  const [loadingPlaces, setLoadingPlaces] = useState(false)
  const [errorToday, setErrorToday]   = useState('')
  const [errorPlaces, setErrorPlaces] = useState('')

  // Load today's story on mount
  useEffect(() => {
    getStoryToday({ limit: 60 })
      .then((res) => setFullDay(res.full_day))
      .catch((e) => setErrorToday(e.message ?? t('story.error')))
      .finally(() => setLoadingToday(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load places when tab switches to places (lazy)
  useEffect(() => {
    if (tab !== 'places' || themes !== null) return
    setLoadingPlaces(true)
    getStoryThemes({ min_photos: 3, limit: 40 })
      .then(setThemes)
      .catch((e) => setErrorPlaces(e.message ?? t('story.error')))
      .finally(() => setLoadingPlaces(false))
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectTheme = (themeId: string) => {
    getThemeDetail(themeId, 200)
      .then(setDetail)
      .catch(() => {})
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'today',  label: t('story.tab.today') },
    { key: 'places', label: t('story.tab.places') },
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
              {t('nav.back.strata')}
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
              {t('story.title')}
            </h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 pb-0">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setDetail(null); setTab(key) }}
              className="px-4 py-2 text-xs rounded-t transition-all"
              style={{
                background: tab === key ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: tab === key ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                borderBottom: tab === key ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="h-px w-full" style={{ background: 'var(--color-glass-border)' }} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden px-8 py-6" style={{ minHeight: 0 }}>
        <AnimatePresence mode="wait">

          {/* Today tab */}
          {tab === 'today' && (
            <motion.div
              key="today"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {loadingToday && <Spinner />}
              {!loadingToday && errorToday && <ErrorMsg msg={errorToday} />}
              {!loadingToday && !errorToday && !fullDay && <EmptyToday />}
              {!loadingToday && !errorToday && fullDay && (
                <FullDayPanel story={fullDay} />
              )}
            </motion.div>
          )}

          {/* Places tab */}
          {tab === 'places' && !detail && (
            <motion.div
              key="places"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {loadingPlaces && <Spinner />}
              {!loadingPlaces && errorPlaces && <ErrorMsg msg={errorPlaces} />}
              {!loadingPlaces && !errorPlaces && themes && (
                <PlacesPanel themesData={themes} onSelectTheme={handleSelectTheme} />
              )}
            </motion.div>
          )}

          {/* Theme detail */}
          {tab === 'places' && detail && (
            <motion.div
              key={`detail-${detail.theme_id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              <ThemeDetailPanel detail={detail} onBack={() => setDetail(null)} />
            </motion.div>
          )}

        </AnimatePresence>
      </div>

    </div>
  )
}

// ── Utility micro-components ───────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <motion.div
        className="w-6 h-6 rounded-full border-2"
        style={{ borderColor: 'var(--strata-2022)', borderTopColor: 'transparent' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{msg}</p>
    </div>
  )
}

function EmptyToday() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
      <p className="font-serif" style={{ color: 'var(--strata-2022)', fontSize: 20 }}>
        {t('story.today.empty.title')}
      </p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)', maxWidth: 240 }}>
        {t('story.today.empty.hint')}
      </p>
    </div>
  )
}
