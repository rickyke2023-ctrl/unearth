import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getStaging, getTrash, confirmStaging, restoreFromStaging, purgeTrash, previewUrl } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { useTranslation } from '../../hooks/useTranslation'
import { formatBytes, formatDate } from '../../utils'
import type { StagingPhoto, TrashPhoto } from '../../types'

type Tab = 'staging' | 'trash'

// ── Thumbnail card ────────────────────────────────────────────────────────────

function PhotoCard({
  photo,
  onRestore,
  badge,
  badgeColor,
}: {
  photo: StagingPhoto | TrashPhoto
  onRestore: (id: string) => void
  badge?: string
  badgeColor?: string
}) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [imgErr, setImgErr] = useState(false)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2, ease: [0.25, 0, 0, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="relative flex flex-col rounded overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Thumbnail */}
      <div className="relative" style={{ aspectRatio: '4/3', background: 'rgba(0,0,0,0.4)' }}>
        {photo.thumbnail_available && !imgErr ? (
          <img
            src={previewUrl(photo.photo_id)}
            alt={photo.filename}
            className="w-full h-full object-cover"
            style={{ filter: 'brightness(0.82)' }}
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
            <span style={{ fontSize: 20, opacity: 0.15 }}>⬛</span>
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, textAlign: 'center', padding: '0 6px', wordBreak: 'break-all' }}>
              {photo.filename}
            </p>
          </div>
        )}

        {badge && (
          <div
            className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-xs font-tabular"
            style={{ background: 'rgba(10,10,15,0.75)', color: badgeColor ?? '#fff', fontSize: 10 }}
          >
            {badge}
          </div>
        )}

        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'rgba(10,10,15,0.6)' }}
            >
              <button
                onClick={() => onRestore(photo.photo_id)}
                className="px-3 py-1.5 rounded text-xs tracking-wider transition-opacity hover:opacity-80"
                style={{
                  background: 'var(--color-keep)',
                  color: 'rgba(10,10,15,0.9)',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {t('staging.restore.btn')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info */}
      <div className="px-2 py-1.5">
        <p
          className="truncate"
          style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}
          title={photo.filename}
        >
          {photo.filename}
        </p>
        <div className="flex justify-between mt-0.5">
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>
            {photo.date_taken ? formatDate(photo.date_taken).replace(/年|月/g, '/').replace('日', '') : '—'}
          </span>
          <span
            className="font-tabular"
            style={{ color: 'var(--color-text-muted)', fontSize: 10 }}
          >
            {formatBytes(photo.file_size_bytes)}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Staging tab ───────────────────────────────────────────────────────────────

function StagingTab({ onMoved }: { onMoved: () => void }) {
  const { t } = useTranslation()
  const [photos, setPhotos] = useState<StagingPhoto[]>([])
  const [totalMb, setTotalMb] = useState(0)
  const [loading, setLoading] = useState(true)
  const [moving, setMoving] = useState(false)

  const load = useCallback(() => {
    getStaging()
      .then((d) => {
        setPhotos(d.photos)
        setTotalMb(d.total_size_mb)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleRestore = async (photo_id: string) => {
    setLoading(true)
    await restoreFromStaging(photo_id).catch(() => {})
    load()
  }

  const handleMoveAllToTrash = async () => {
    setMoving(true)
    try {
      await confirmStaging()
      onMoved()
    } catch {
      setMoving(false)
    }
  }

  if (loading) return <EmptyState icon="⏳" text={t('staging.loading')} />

  if (photos.length === 0) {
    return <EmptyState icon="✦" text={t('staging.pending.empty')} subtext={t('staging.pending.hint')} />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <span>
            <span style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {photos.length}
            </span>
          </span>
          <span>
            <span style={{ color: 'var(--color-leave)', fontVariantNumeric: 'tabular-nums' }}>
              {totalMb.toFixed(1)} MB
            </span>{' '}{t('staging.size.used')}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('staging.hover.restore')}
        </p>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <motion.div layout className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <AnimatePresence mode="popLayout">
            {photos.map((p) => (
              <PhotoCard key={p.photo_id} photo={p} onRestore={handleRestore} />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* CTA */}
      <div
        className="px-5 py-4 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="mb-2.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('staging.move.note')}
        </div>
        <button
          onClick={handleMoveAllToTrash}
          disabled={moving}
          className="w-full py-3 rounded text-sm tracking-wider transition-opacity disabled:opacity-40 hover:opacity-80"
          style={{ background: 'var(--color-leave)', color: '#fff' }}
        >
          {moving ? t('staging.moving') : `${t('staging.move.action')} · ${totalMb.toFixed(1)} MB`}
        </button>
      </div>
    </div>
  )
}

// ── Trash tab ─────────────────────────────────────────────────────────────────

function TrashTab({ onPurged }: { onPurged: () => void }) {
  const { t, lang } = useTranslation()
  const [photos, setPhotos] = useState<TrashPhoto[]>([])
  const [totalMb, setTotalMb] = useState(0)
  const [loading, setLoading] = useState(true)
  const [purging, setPurging] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const load = useCallback(() => {
    getTrash()
      .then((d) => {
        setPhotos(d.photos)
        setTotalMb(d.total_size_mb)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleRestore = async (photo_id: string) => {
    setLoading(true)
    await restoreFromStaging(photo_id).catch(() => {})
    load()
  }

  const handlePurge = async () => {
    setPurging(true)
    try {
      await purgeTrash()
      onPurged()
    } catch {
      setPurging(false)
      setShowConfirm(false)
    }
  }

  function daysColor(days: number) {
    if (days > 14) return 'var(--color-keep)'
    if (days > 7) return '#e0b86a'
    return 'var(--color-leave)'
  }

  const daysBadge = (days: number) =>
    lang === 'en' ? `${days}d` : `${days}天`

  if (loading) return <EmptyState icon="⏳" text={t('staging.loading')} />

  if (photos.length === 0) {
    return <EmptyState icon="◎" text={t('trash.empty.title')} subtext={t('trash.empty.hint')} />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <span>
            <span style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {photos.length}
            </span>
          </span>
          <span>
            <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {totalMb.toFixed(1)} MB
            </span>
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('trash.hover.restore')}
        </p>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <motion.div layout className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <AnimatePresence mode="popLayout">
            {photos.map((p) => (
              <PhotoCard
                key={p.photo_id}
                photo={p}
                onRestore={handleRestore}
                badge={daysBadge(p.days_remaining)}
                badgeColor={daysColor(p.days_remaining)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* CTA */}
      <div
        className="px-5 py-4 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        <AnimatePresence mode="wait">
          {!showConfirm ? (
            <motion.button
              key="trigger"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirm(true)}
              className="w-full py-3 rounded text-sm tracking-wider transition-opacity hover:opacity-70"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {t('trash.purge.btn')}
            </motion.button>
          ) : (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2"
            >
              <p className="text-xs text-center" style={{ color: 'var(--color-leave)' }}>
                {lang === 'en'
                  ? `Permanently delete these ${photos.length} photos? This cannot be undone.`
                  : `确定要立刻永久删除这 ${photos.length} 张照片吗？此操作不可撤销。`}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 rounded text-sm transition-opacity hover:opacity-70"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-text-secondary)' }}
                >
                  {t('trash.purge.cancel')}
                </button>
                <button
                  onClick={handlePurge}
                  disabled={purging}
                  className="flex-1 py-2.5 rounded text-sm transition-opacity disabled:opacity-40 hover:opacity-80"
                  style={{ background: 'var(--color-leave)', color: '#fff' }}
                >
                  {purging ? t('trash.purge.clearing') : t('trash.purge.confirm')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ icon, text, subtext }: { icon: string; text: string; subtext?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16">
      <span style={{ fontSize: 28, opacity: 0.25 }}>{icon}</span>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{text}</p>
      {subtext && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{subtext}</p>
      )}
    </div>
  )
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function StagingConfirmDialog() {
  const { showStagingDialog, setShowStagingDialog } = useAppStore()
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('staging')
  const [trashCount, setTrashCount] = useState(0)
  const [stagingCount, setStagingCount] = useState(0)

  useEffect(() => {
    if (!showStagingDialog) return
    void (async () => {
      setTab('staging')
      try {
        const [s, tr] = await Promise.all([getStaging(), getTrash()])
        setStagingCount(s.total_count)
        setTrashCount(tr.total_count)
      } catch { /* suppress */ }
    })()
  }, [showStagingDialog])

  const handleClose = () => setShowStagingDialog(false)

  const handleMoved = () => {
    setTab('trash')
    setStagingCount(0)
    getTrash().then((tr) => setTrashCount(tr.total_count)).catch(() => {})
  }

  const handlePurged = () => {
    setTrashCount(0)
  }

  return (
    <AnimatePresence>
      {showStagingDialog && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(10,10,15,0.88)' }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: [0.25, 0, 0, 1] }}
            className="glass rounded-xl flex flex-col overflow-hidden"
            style={{ width: 680, height: 580, maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
            >
              <h2
                className="tracking-widest"
                style={{ color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 400, letterSpacing: '0.1em' }}
              >
                {t('staging.title')}
              </h2>

              {/* Tabs */}
              <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                {(['staging', 'trash'] as Tab[]).map((tabKey) => {
                  const count = tabKey === 'staging' ? stagingCount : trashCount
                  const label = tabKey === 'staging' ? t('staging.tab.pending') : t('staging.tab.trash')
                  const active = tab === tabKey
                  return (
                    <button
                      key={tabKey}
                      onClick={() => setTab(tabKey)}
                      className="px-3 py-1.5 rounded text-xs tracking-wider transition-all"
                      style={{
                        background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                        color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                      }}
                    >
                      {label}
                      {count > 0 && (
                        <span
                          className="ml-1.5 font-tabular"
                          style={{
                            color: tabKey === 'staging' ? 'var(--color-leave)' : 'var(--color-text-muted)',
                            fontSize: 10,
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={handleClose}
                className="transition-opacity hover:opacity-60 text-lg leading-none"
                style={{ color: 'var(--color-text-muted)', width: 28, textAlign: 'center' }}
              >
                ×
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 flex flex-col min-h-0">
              <AnimatePresence mode="wait">
                {tab === 'staging' ? (
                  <motion.div
                    key="staging"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-col flex-1 min-h-0"
                  >
                    <StagingTab onMoved={handleMoved} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="trash"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-col flex-1 min-h-0"
                  >
                    <TrashTab onPurged={handlePurged} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
