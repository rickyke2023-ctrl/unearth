/**
 * GatewayView — 微光之门
 *
 * The threshold between Archive and Discovery.
 * A single point of light in darkness — the user must reach out first.
 * Then the world splits open: 整理 or 发现.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'

type Phase = 'dormant' | 'awakening' | 'revealed'

export function GatewayView() {
  const { setView } = useAppStore()
  const [phase, setPhase] = useState<Phase>('dormant')

  const handleTouch = () => {
    if (phase !== 'dormant') return
    setPhase('awakening')
    setTimeout(() => setPhase('revealed'), 700)
  }

  return (
    <div
      onClick={handleTouch}
      style={{
        background: '#030201',
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        cursor: phase === 'dormant' ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {/* Ambient radial glow — breathes in dormant, blooms on awakening */}
      <motion.div
        animate={
          phase === 'dormant'
            ? { opacity: [0.04, 0.11, 0.04], scale: [1, 1.3, 1] }
            : phase === 'awakening'
            ? { opacity: 0.4, scale: 4 }
            : { opacity: 0.07, scale: 6 }
        }
        transition={
          phase === 'dormant'
            ? { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.65, ease: [0.25, 0, 0, 1] }
        }
        style={{
          position: 'absolute',
          width: 360,
          height: 360,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(200,155,70,0.55) 0%, rgba(180,130,50,0.15) 40%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Dormant + Awakening: central orb ───────────────────────── */}
      <AnimatePresence>
        {phase !== 'revealed' && (
          <motion.div
            key="orb-group"
            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.3 } }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 28,
              position: 'relative',
            }}
          >
            {/* Core light point */}
            <motion.div
              animate={
                phase === 'dormant'
                  ? { scale: [1, 1.25, 1], opacity: [0.55, 1, 0.55] }
                  : { scale: [1, 3.5], opacity: [1, 0] }
              }
              transition={
                phase === 'dormant'
                  ? { duration: 3.5, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.45, ease: 'easeOut' }
              }
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'rgba(220,175,90,0.95)',
                boxShadow:
                  '0 0 18px rgba(200,155,70,0.7), 0 0 38px rgba(200,130,50,0.35)',
              }}
            />

            {/* Outer ring — pulses faintly */}
            {phase === 'dormant' && (
              <motion.div
                animate={{ scale: [1, 1.6, 1], opacity: [0.12, 0, 0.12] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: '1px solid rgba(200,155,70,0.4)',
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* Invitation glyph — fades in after 2s */}
            {phase === 'dormant' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2, duration: 2, ease: 'easeInOut' }}
                style={{
                  fontFamily: 'var(--font-serif, Georgia, serif)',
                  fontSize: 11,
                  letterSpacing: '0.3em',
                  color: 'rgba(200,165,80,0.3)',
                }}
              >
                触
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Revealed: two paths ─────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'revealed' && (
          <motion.div
            key="paths"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.25, 0, 0, 1] }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 44,
              position: 'relative',
            }}
          >
            {/* Eyebrow */}
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.7 }}
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: '0.28em',
                color: 'rgba(200,165,80,0.28)',
                textAlign: 'center',
              }}
            >
              你的记忆，正在等待被召唤
            </motion.div>

            {/* Path cards row */}
            <div
              style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── 整理 ── */}
              <motion.button
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25, duration: 0.6, ease: [0.25, 0, 0, 1] }}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.025)' }}
                onClick={() => setView('strata')}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRight: 'none',
                  borderRadius: '4px 0 0 4px',
                  cursor: 'pointer',
                  padding: '32px 44px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 14,
                  minWidth: 160,
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'background 0.2s',
                }}
              >
                {/* subtle bottom glow */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '60%',
                    height: 40,
                    background:
                      'radial-gradient(ellipse at center bottom, rgba(140,160,180,0.07) 0%, transparent 70%)',
                    pointerEvents: 'none',
                  }}
                />
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 8,
                    letterSpacing: '0.22em',
                    color: 'rgba(180,200,220,0.3)',
                  }}
                >
                  ARCHIVE
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-serif, Georgia, serif)',
                    fontSize: 26,
                    fontWeight: 400,
                    color: 'rgba(255,255,255,0.5)',
                    letterSpacing: '0.1em',
                  }}
                >
                  整理
                </span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.18)',
                    letterSpacing: '0.04em',
                    lineHeight: 1.65,
                    textAlign: 'center',
                    maxWidth: 96,
                  }}
                >
                  清点你留下的光影
                </span>
              </motion.button>

              {/* Vertical divider */}
              <motion.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.5 }}
                style={{
                  width: 1,
                  background: 'rgba(255,255,255,0.07)',
                  flexShrink: 0,
                }}
              />

              {/* ── 发现 ── */}
              <motion.button
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25, duration: 0.6, ease: [0.25, 0, 0, 1] }}
                whileHover={{ backgroundColor: 'rgba(200,155,70,0.04)' }}
                onClick={() => setView('library')}
                style={{
                  background: 'none',
                  border: '1px solid rgba(200,155,70,0.18)',
                  borderLeft: 'none',
                  borderRadius: '0 4px 4px 0',
                  cursor: 'pointer',
                  padding: '32px 44px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 14,
                  minWidth: 160,
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'background 0.2s',
                }}
              >
                {/* warm bottom glow */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '70%',
                    height: 50,
                    background:
                      'radial-gradient(ellipse at center bottom, rgba(200,155,70,0.1) 0%, transparent 70%)',
                    pointerEvents: 'none',
                  }}
                />
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 8,
                    letterSpacing: '0.22em',
                    color: 'rgba(200,165,80,0.45)',
                  }}
                >
                  DISCOVER
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-serif, Georgia, serif)',
                    fontSize: 26,
                    fontWeight: 400,
                    color: 'rgba(220,185,110,0.85)',
                    letterSpacing: '0.1em',
                  }}
                >
                  发现
                </span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    color: 'rgba(200,165,80,0.3)',
                    letterSpacing: '0.04em',
                    lineHeight: 1.65,
                    textAlign: 'center',
                    maxWidth: 96,
                  }}
                >
                  五种叙事，等待开启
                </span>
              </motion.button>
            </div>

            {/* Footer hint */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 1 }}
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: '0.16em',
                color: 'rgba(255,255,255,0.1)',
              }}
            >
              同一批照片 · 两种世界
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
