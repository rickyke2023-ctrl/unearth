/**
 * KhazarView — 哈扎尔词典
 *
 * A dictionary-aesthetic view that groups photos by time-of-day, camera,
 * medium, and season. Each "entry" is a door into a different dimension of
 * the same archive.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getKhazarEntries, getKhazarEntry, getKhazarCrossRefs, previewUrl } from '../../api'
import { useAppStore } from '../../stores/appStore'
import type { KhazarEntry, KhazarEntryType, KhazarCrossRef } from '../../types'
import type { Photo } from '../../types'

// ── Colour palette ─────────────────────────────────────────────────────────

const TYPE_COLOR: Record<KhazarEntryType, string> = {
  time:   '#c9a84c',  // gold
  camera: '#a8a8b8',  // silver
  medium: '#b87333',  // copper
  season: '#6b9e7a',  // green
}

const TYPE_LABEL: Record<KhazarEntryType, string> = {
  time:   '时辰',
  camera: '相机',
  medium: '介质',
  season: '季节',
}

// ── Entry card ─────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  index,
  onClick,
}: {
  entry: KhazarEntry
  index: number
  onClick: () => void
}) {
  const color = TYPE_COLOR[entry.type]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: [0.25, 0, 0, 1] }}
      onClick={onClick}
      whileHover={{ y: -3, boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${color}44` }}
      style={{
        cursor: 'pointer',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 3,
        padding: '20px 22px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Aged-paper noise texture */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E")',
        backgroundSize: '200px 200px',
        opacity: 0.6,
      }} />

      {/* Left accent line */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 2, background: color,
        boxShadow: `0 0 8px ${color}66`,
      }} />

      <div style={{ paddingLeft: 8 }}>
        {/* Type badge */}
        <div style={{
          display: 'inline-block',
          fontSize: 9, letterSpacing: '0.12em',
          color, fontFamily: 'monospace',
          marginBottom: 8, opacity: 0.8,
        }}>
          {TYPE_LABEL[entry.type]}
        </div>

        {/* Title */}
        <div style={{
          fontFamily: 'var(--font-serif, Georgia, serif)',
          fontSize: 20, fontWeight: 400,
          letterSpacing: '0.05em',
          color: 'rgba(255,255,255,0.82)',
          marginBottom: 10,
          lineHeight: 1.2,
        }}>
          {entry.title}
        </div>

        {/* Ornamental divider */}
        <div style={{
          fontSize: 10, color: 'rgba(255,255,255,0.12)',
          letterSpacing: 3, marginBottom: 10,
        }}>
          ─────
        </div>

        {/* Photo count + cover thumb row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: 11, color: 'rgba(255,255,255,0.35)',
            fontFamily: 'monospace', letterSpacing: '0.08em',
          }}>
            {entry.photo_count} 张
          </span>

          {entry.cover_photo_id ? (
            <div style={{
              width: 36, height: 36, borderRadius: 2,
              overflow: 'hidden', border: `1px solid ${color}44`,
            }}>
              <img
                src={previewUrl(entry.cover_photo_id)}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
              />
            </div>
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: 2,
              border: `1px solid ${color}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: `${color}55`, fontSize: 14,
            }}>
              ◌
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Entry skeleton ─────────────────────────────────────────────────────────

function EntrySkeleton({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.5, repeat: Infinity, delay: index * 0.1 }}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 3,
        height: 110,
      }}
    />
  )
}

// ── Entry detail panel ─────────────────────────────────────────────────────

function EntryDetail({
  entry,
  onClose,
}: {
  entry: KhazarEntry
  onClose: () => void
}) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [total, setTotal] = useState(0)
  const [crossRefs, setCrossRefs] = useState<KhazarCrossRef[]>([])
  const [loading, setLoading] = useState(true)
  const { setView } = useAppStore()
  const color = TYPE_COLOR[entry.type]

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const [detail, refs] = await Promise.all([
          getKhazarEntry(entry.entry_id, 50, 0),
          getKhazarCrossRefs(entry.entry_id),
        ])
        setPhotos(detail.photos)
        setTotal(detail.total)
        setCrossRefs(refs.cross_refs)
      } catch { /* suppress */ } finally {
        setLoading(false)
      }
    })()
  }, [entry.entry_id])

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.3, ease: [0.25, 0, 0, 1] }}
      style={{
        position: 'absolute', inset: 0,
        background: 'var(--color-void)',
        overflowY: 'auto',
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '24px 32px 0',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--color-text-muted)', padding: 0,
          }}
        >
          ← 词条列表
        </button>

        <div style={{
          fontSize: 9, letterSpacing: '0.12em',
          color, fontFamily: 'monospace',
        }}>
          {TYPE_LABEL[entry.type]}
        </div>
      </div>

      <div style={{ padding: '16px 32px 40px' }}>
        {/* Entry title */}
        <h2 style={{
          margin: '0 0 4px',
          fontFamily: 'var(--font-serif, Georgia, serif)',
          fontSize: 32, fontWeight: 400,
          letterSpacing: '0.06em',
          color: 'rgba(255,255,255,0.85)',
        }}>
          {entry.title}
        </h2>
        <p style={{
          margin: '0 0 24px',
          fontSize: 12, color: 'rgba(255,255,255,0.28)',
          fontFamily: 'monospace', letterSpacing: '0.06em',
        }}>
          {total} 张照片 · {TYPE_LABEL[entry.type]}
        </p>

        {/* Divider */}
        <div style={{
          height: 1, background: 'rgba(255,255,255,0.06)',
          marginBottom: 24,
        }} />

        {/* Photo grid */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.2, 0.4, 0.2] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }}
                style={{ aspectRatio: '1', background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}
              />
            ))}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4,
            marginBottom: 32,
          }}>
            {photos.map((photo, i) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: 2 }}
              >
                <img
                  src={previewUrl(photo.id)}
                  alt={photo.file_name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </motion.div>
            ))}
          </div>
        )}

        {/* Cross-references */}
        {crossRefs.length > 0 && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              marginBottom: 16,
            }}>
              <span style={{
                fontSize: 10, letterSpacing: '0.15em',
                color: 'rgba(255,255,255,0.25)',
                fontFamily: 'monospace',
              }}>
                ···  相关词条  ···
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {crossRefs.map((ref) => (
                <button
                  key={ref.entry_id}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${TYPE_COLOR[ref.type]}22`,
                    borderRadius: 3,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    textAlign: 'left',
                  }}
                  onClick={() => setView('khazar')}
                >
                  <div>
                    <span style={{
                      fontSize: 9, letterSpacing: '0.1em',
                      color: TYPE_COLOR[ref.type], fontFamily: 'monospace',
                      marginRight: 10, opacity: 0.7,
                    }}>
                      {TYPE_LABEL[ref.type]}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-serif, Georgia, serif)',
                      fontSize: 15, color: 'rgba(255,255,255,0.65)',
                    }}>
                      {ref.title}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.2)',
                    fontFamily: 'monospace',
                  }}>
                    {ref.overlap_count} 张
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}

// ── Filter tabs ────────────────────────────────────────────────────────────

const FILTERS: Array<{ value: KhazarEntryType | 'all'; label: string }> = [
  { value: 'all',    label: '全部' },
  { value: 'time',   label: '时辰' },
  { value: 'camera', label: '相机' },
  { value: 'medium', label: '介质' },
  { value: 'season', label: '季节' },
]

// ── Main KhazarView ────────────────────────────────────────────────────────

export function KhazarView() {
  const { setView } = useAppStore()
  const [entries, setEntries] = useState<KhazarEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<KhazarEntryType | 'all'>('all')
  const [selected, setSelected] = useState<KhazarEntry | null>(null)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const res = await getKhazarEntries()
        setEntries(res.entries)
      } catch (e: unknown) {
        setError((e as Error).message ?? '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const visible = filter === 'all'
    ? entries
    : entries.filter((e) => e.type === filter)

  const handleSelect = useCallback((entry: KhazarEntry) => {
    setSelected(entry)
  }, [])

  const handleClose = useCallback(() => {
    setSelected(null)
  }, [])

  return (
    <div style={{
      background: 'var(--color-void)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 32px 0',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button
          onClick={() => setView('library')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--color-text-muted)', padding: 0,
          }}
        >
          ← 书库
        </button>

        <div style={{ textAlign: 'center' }}>
          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif, Georgia, serif)',
              fontSize: 26, fontWeight: 400,
              letterSpacing: '0.15em',
              color: 'rgba(255,255,255,0.75)',
            }}
          >
            哈扎尔词典
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            style={{
              margin: '4px 0 0', fontSize: 10,
              color: 'var(--color-text-muted)',
              letterSpacing: '0.1em', fontFamily: 'monospace',
            }}
          >
            Dictionary of the Khazars
          </motion.p>
        </div>

        <div style={{ width: 48 }} />
      </div>

      {/* Divider */}
      <div style={{
        height: 1, background: 'var(--color-glass-border)',
        margin: '16px 32px 0',
        flexShrink: 0,
      }} />

      {/* Filter tabs */}
      <div style={{
        padding: '14px 32px 0',
        display: 'flex', gap: 6,
        flexShrink: 0,
      }}>
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value as KhazarEntryType | 'all')}
            style={{
              background: filter === value ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: `1px solid ${filter === value ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 3,
              padding: '5px 12px',
              fontSize: 10, letterSpacing: '0.1em',
              color: filter === value ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'monospace',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Entry grid */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '20px 32px 40px',
      }}>
        {error ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center', marginTop: 60 }}>
            {error}
          </p>
        ) : loading ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 10,
          }}>
            {Array.from({ length: 12 }).map((_, i) => <EntrySkeleton key={i} index={i} />)}
          </div>
        ) : (
          <motion.div
            key={filter}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
            }}
          >
            {visible.map((entry, i) => (
              <EntryCard
                key={entry.entry_id}
                entry={entry}
                index={i}
                onClick={() => handleSelect(entry)}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Entry detail slide-in */}
      <AnimatePresence>
        {selected && (
          <EntryDetail entry={selected} onClose={handleClose} />
        )}
      </AnimatePresence>
    </div>
  )
}
