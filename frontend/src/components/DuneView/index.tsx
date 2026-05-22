/**
 * DuneView — 《沙丘》叙事模式
 *
 * Photos presented as archaeological artifacts from an unknown civilisation.
 * Mystery is the narrative. Absence is the story.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getDuneFragments, previewUrl } from '../../api'
import { useAppStore } from '../../stores/appStore'
import type { DuneFragment, DuneResult } from '../../types'

// ── Noise / grain texture (inline SVG filter) ─────────────────────────────

const GrainFilter = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }}>
    <defs>
      <filter id="dune-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
        <feBlend in="SourceGraphic" mode="multiply" result="blend" />
        <feComposite in="blend" in2="SourceGraphic" operator="in" />
      </filter>
    </defs>
  </svg>
)

// ── Single artifact card ──────────────────────────────────────────────────

function ArtifactCard({
  fragment,
  active,
  onClick,
}: {
  fragment: DuneFragment
  active: boolean
  onClick: () => void
}) {
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: active ? 1 : 0.35 }}
      whileHover={{ opacity: 0.75, scale: 1.01 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'relative',
        cursor: 'pointer',
        aspectRatio: '3/2',
        background: '#0a0805',
        border: `1px solid ${active ? 'rgba(180,160,120,0.35)' : 'rgba(180,160,120,0.1)'}`,
        borderRadius: 2,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {!imgError && (
        <img
          src={previewUrl(fragment.id)}
          alt=""
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            filter: 'sepia(0.4) contrast(0.85) brightness(0.75)',
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.6s ease',
          }}
        />
      )}
      {/* grain overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(8,6,4,0.25)',
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.08\'/%3E%3C/svg%3E")',
        backgroundSize: '120px 120px',
        mixBlendMode: 'overlay',
        pointerEvents: 'none',
      }} />
      {/* fragment id badge */}
      <div style={{
        position: 'absolute', top: 6, left: 6,
        fontFamily: 'monospace', fontSize: 9,
        color: 'rgba(180,160,100,0.6)',
        letterSpacing: '0.12em',
      }}>
        {fragment.fragment_id}
      </div>
    </motion.div>
  )
}

// ── Artifact record panel (right side) ────────────────────────────────────

function ArtifactRecord({ fragment }: { fragment: DuneFragment }) {
  const lines: Array<{ label: string; value: string }> = [
    { label: 'FRAGMENT',  value: fragment.fragment_id },
    { label: 'ERA',       value: fragment.era },
    { label: 'TERRITORY', value: fragment.territory },
    { label: 'INSTRUMENT', value: fragment.instrument },
    { label: 'CONDITION', value: fragment.condition.toUpperCase() },
    { label: 'FORMAT',    value: fragment.file_type.replace('_', ' ') },
  ]

  return (
    <motion.div
      key={fragment.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      style={{ fontFamily: 'monospace' }}
    >
      {/* Main image */}
      <div style={{
        width: '100%',
        aspectRatio: '3/2',
        background: '#0a0805',
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid rgba(180,160,120,0.2)',
      }}>
        <img
          src={previewUrl(fragment.id)}
          alt=""
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            filter: 'sepia(0.5) contrast(0.82) brightness(0.72)',
          }}
        />
        {/* vignette */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(6,4,2,0.7) 100%)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Record fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lines.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', gap: 12 }}>
            <span style={{
              fontSize: 9, letterSpacing: '0.14em',
              color: 'rgba(180,160,100,0.4)',
              width: 80, flexShrink: 0, paddingTop: 1,
            }}>
              {label}
            </span>
            <span style={{
              fontSize: 11, letterSpacing: '0.06em',
              color: label === 'CONDITION' && fragment.mystery_score >= 0.7
                ? 'rgba(180,140,80,0.8)'
                : 'rgba(220,200,160,0.75)',
              lineHeight: 1.5,
            }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Mystery score bar */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'rgba(180,160,100,0.35)', marginBottom: 6 }}>
          MYSTERY LEVEL
        </div>
        <div style={{ height: 2, background: 'rgba(180,160,100,0.12)', borderRadius: 1 }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${fragment.mystery_score * 100}%` }}
            transition={{ duration: 0.8, ease: [0.25, 0, 0, 1], delay: 0.2 }}
            style={{
              height: '100%', borderRadius: 1,
              background: fragment.mystery_score >= 0.7
                ? 'rgba(180,140,80,0.7)'
                : 'rgba(180,160,100,0.4)',
            }}
          />
        </div>
      </div>
    </motion.div>
  )
}

// ── Main DuneView ─────────────────────────────────────────────────────────

export function DuneView() {
  const { setView } = useAppStore()
  const [data, setData]       = useState<DuneResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive]   = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)

  // Use today's date as seed so the selection is consistent within a day
  const todaySeed = parseInt(
    new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    10,
  )

  useEffect(() => {
    getDuneFragments({ limit: 24, seed: todaySeed })
      .then((res) => { setData(res); setLoading(false) })
      .catch(() => setLoading(false))
  }, [todaySeed])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!data) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      setActive((i) => Math.min(i + 1, data.fragments.length - 1))
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      setActive((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Escape') setView('library')
  }, [data, setView])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  const fragment = data?.fragments[active] ?? null

  return (
    <div
      style={{
        background: '#060402',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        color: 'rgba(220,200,160,0.8)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <GrainFilter />

      {/* Grain overlay on entire view */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 300 300\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E")',
        backgroundSize: '200px 200px',
        opacity: 0.6,
      }} />

      {/* Header */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 28px',
        borderBottom: '1px solid rgba(180,160,100,0.08)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setView('library')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.12em',
            color: 'rgba(180,160,100,0.45)',
          }}
        >
          ← LIBRARY
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(180,160,100,0.4)' }}>
            UNKNOWN ARCHIVES
          </div>
          {data && (
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(180,160,100,0.25)', marginTop: 3 }}>
              {data.total_unknown.toLocaleString()} UNIDENTIFIED FRAGMENTS
            </div>
          )}
        </div>

        <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(180,160,100,0.3)', letterSpacing: '0.08em' }}>
          {active + 1} / {data?.fragments.length ?? '—'}
        </div>
      </div>

      {loading && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', zIndex: 1,
        }}>
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(180,160,100,0.5)' }}
          >
            RETRIEVING FRAGMENTS…
          </motion.div>
        </div>
      )}

      {!loading && data && (
        <div style={{
          flex: 1, display: 'flex', minHeight: 0,
          position: 'relative', zIndex: 1,
        }}>
          {/* Left: thumbnail grid */}
          <div
            ref={gridRef}
            style={{
              width: 260, flexShrink: 0,
              overflowY: 'auto', padding: '16px 12px',
              borderRight: '1px solid rgba(180,160,100,0.07)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
              alignContent: 'start',
            }}
          >
            {data.fragments.map((f, i) => (
              <ArtifactCard
                key={f.id}
                fragment={f}
                active={i === active}
                onClick={() => setActive(i)}
              />
            ))}
          </div>

          {/* Right: artifact record */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '28px 36px',
          }}>
            <AnimatePresence mode="wait">
              {fragment && <ArtifactRecord key={fragment.id} fragment={fragment} />}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Footer hint */}
      {!loading && (
        <div style={{
          position: 'relative', zIndex: 1, flexShrink: 0,
          padding: '10px 28px',
          borderTop: '1px solid rgba(180,160,100,0.07)',
          fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.1em',
          color: 'rgba(180,160,100,0.2)',
          display: 'flex', justifyContent: 'center', gap: 24,
        }}>
          <span>← → navigate</span>
          <span>ESC  return to library</span>
        </div>
      )}
    </div>
  )
}
