import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '../../hooks/useTranslation'

// ── Public handle (used by CameraGesture in future) ───────────────────────
export interface ScrubRevealHandle {
  scrubAt(nx: number, ny: number): void   // 0-1 normalised coords
}

interface ScrubRevealProps {
  src: string
  alt?: string
  onRevealed: () => void
}

const REVEAL_THRESHOLD  = 0.72
const BRUSH_SIZE_MOUSE  = 58
const BRUSH_SIZE_TOUCH  = 72
const GRID_COLS         = 32
const GRID_ROWS         = 32
const SOUND_THROTTLE_MS = 42   // max scratch sound rate

// ── Coverage grid (low-res, avoids getImageData per frame) ────────────────

class CoverageGrid {
  private cells: Uint8Array
  private cols:  number
  private rows:  number
  cleared = 0

  constructor(cols: number, rows: number) {
    this.cols  = cols
    this.rows  = rows
    this.cells = new Uint8Array(cols * rows)
  }

  mark(nx: number, ny: number, brushFrac: number) {
    const cx = nx * this.cols
    const cy = ny * this.rows
    const r  = brushFrac * this.cols
    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(this.cols - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(this.rows - 1, Math.ceil(cy + r))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const idx = y * this.cols + x
        if (!this.cells[idx]) { this.cells[idx] = 1; this.cleared++ }
      }
    }
  }

  get coverage() { return this.cleared / (this.cols * this.rows) }
}

// ── Web Audio helpers (no external files needed) ──────────────────────────

function getAudioCtx(ref: React.MutableRefObject<AudioContext | null>): AudioContext | null {
  try {
    if (!ref.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)()
    }
    const ac = ref.current
    if (ac && ac.state === 'suspended') ac.resume()
    return ref.current
  } catch { return null }
}

/** Soft earth-scraping sound: short burst of bandpass-filtered noise */
function playScratch(ctx: AudioContext) {
  try {
    const dur = 0.038 + Math.random() * 0.022
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate)
    const d   = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.7
    }
    const src  = ctx.createBufferSource()
    src.buffer = buf
    const filt = ctx.createBiquadFilter()
    filt.type           = 'bandpass'
    filt.frequency.value = 460 + Math.random() * 660
    filt.Q.value        = 1.15
    const gain       = ctx.createGain()
    gain.gain.value  = 0.048
    src.connect(filt); filt.connect(gain); gain.connect(ctx.destination)
    src.start()
  } catch { /* WebAudio not available */ }
}

/** Meditative singing bowl: soft onset, long harmonic decay, subtle shimmer */
function playSingingBowl(ctx: AudioContext) {
  try {
    const now = ctx.currentTime
    // Non-integer overtone ratios match real Tibetan bowl acoustics
    const partials = [
      { freq: 392,        maxGain: 0.072, attack: 0.28, decay: 5.8 },
      { freq: 392 * 2.76, maxGain: 0.032, attack: 0.42, decay: 4.4 },
      { freq: 392 * 4.95, maxGain: 0.016, attack: 0.58, decay: 3.2 },
    ]
    partials.forEach(({ freq, maxGain, attack, decay }) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      // Tiny LFO shimmer (~0.2% frequency depth)
      const lfo     = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      lfo.type            = 'sine'
      lfo.frequency.value = 5.5 + Math.random() * 1.5
      lfoGain.gain.value  = freq * 0.0022
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency)
      osc.type            = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(maxGain, now + attack)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay)
      osc.connect(gain); gain.connect(ctx.destination)
      const end = now + attack + decay + 0.1
      lfo.start(now); lfo.stop(end)
      osc.start(now); osc.stop(end)
    })
  } catch { /* WebAudio not available */ }
}

// ── Component ─────────────────────────────────────────────────────────────

export const ScrubReveal = forwardRef<ScrubRevealHandle, ScrubRevealProps>(
  function ScrubReveal({ src, alt = '', onRevealed }, ref) {
    const { t } = useTranslation()

    const canvasRef    = useRef<HTMLCanvasElement>(null)
    const imgRef       = useRef<HTMLImageElement>(null)
    const glowRef      = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const gridRef      = useRef(new CoverageGrid(GRID_COLS, GRID_ROWS))
    const drawingRef   = useRef(false)
    const doneRef      = useRef(false)
    const audioCtxRef  = useRef<AudioContext | null>(null)
    const lastSoundRef = useRef(0)

    const [phase,     setPhase]     = useState<'cover' | 'reveal' | 'done'>('cover')
    const [imgLoaded, setImgLoaded] = useState(false)

    // Cached images: React's synthetic onLoad sometimes doesn't fire when the
    // image is already in browser cache (e.g. preloaded by ExcavationView).
    // Check img.complete after mount as a fallback.
    useEffect(() => {
      if (imgRef.current?.complete) setImgLoaded(true)
    }, []) // intentionally empty — one-time post-mount check

    // ── Rich geological canvas texture ──────────────────────────────────────

    const initCanvas = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      const w = canvas.width
      const h = canvas.height

      // 1. Deep earth radial base
      const base = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.88)
      base.addColorStop(0,   '#231709')
      base.addColorStop(0.4, '#1c1007')
      base.addColorStop(1,   '#0d0803')
      ctx.fillStyle = base
      ctx.fillRect(0, 0, w, h)

      // 2. Geological strata bands (wavy, irregular)
      const strata = [
        { y: h * 0.14, color: '#2b1c0a', alpha: 0.62 },
        { y: h * 0.31, color: '#1f1307', alpha: 0.52 },
        { y: h * 0.49, color: '#2e200e', alpha: 0.58 },
        { y: h * 0.66, color: '#191106', alpha: 0.48 },
        { y: h * 0.82, color: '#241709', alpha: 0.54 },
      ]
      strata.forEach(({ y: sy, color, alpha }, si) => {
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.moveTo(-2, sy)
        for (let x = 0; x <= w + 12; x += 5) {
          const wy = sy
            + Math.sin(x * 0.021 + si * 1.9) * 8
            + Math.sin(x * 0.006 + si * 2.4) * 13
            + (Math.random() - 0.5) * 2.8
          ctx.lineTo(x, wy)
        }
        ctx.lineTo(w + 2, h + 2); ctx.lineTo(-2, h + 2); ctx.closePath()
        ctx.fillStyle = color; ctx.fill()
        ctx.restore()
      })

      // 3. Fine pixel noise (warm-tinted)
      const id = ctx.getImageData(0, 0, w, h)
      const d  = id.data
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 30
        d[i]     = Math.min(255, Math.max(0, d[i]     + n))
        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n * 0.50))
        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n * 0.16))
      }
      ctx.putImageData(id, 0, 0)

      // 4. Soil aggregate clumps (two-scale)
      for (let a = 0; a < 220; a++) {
        const ax     = Math.random() * w
        const ay     = Math.random() * h
        const r      = 1.5 + Math.random() * 16
        const bright = Math.random() > 0.48
        const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, r)
        g.addColorStop(0, bright ? 'rgba(52,32,11,0.24)' : 'rgba(5,2,1,0.30)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(ax, ay, r, r * (0.4 + Math.random() * 0.95), Math.random() * Math.PI, 0, Math.PI * 2)
        ctx.fill()
      }

      // 5. Hairline cracks
      for (let c = 0; c < 16; c++) {
        ctx.save()
        ctx.strokeStyle = `rgba(4,2,1,${0.25 + Math.random() * 0.42})`
        ctx.lineWidth   = Math.random() < 0.22 ? 1.6 : 0.75
        ctx.beginPath()
        let cx2 = Math.random() * w
        let cy2 = Math.random() * h * 0.55
        ctx.moveTo(cx2, cy2)
        for (let s = 0; s < 4 + Math.floor(Math.random() * 8); s++) {
          cx2 = Math.min(w, Math.max(0, cx2 + (Math.random() - 0.5) * 48))
          cy2 += Math.random() * 40 + 5
          ctx.lineTo(cx2, cy2)
        }
        ctx.stroke(); ctx.restore()
      }

      // 6. Buried artifact impressions (oval shadows hinting at something below)
      for (let a = 0; a < 7; a++) {
        const ax = w * 0.08 + Math.random() * w * 0.84
        const ay = h * 0.08 + Math.random() * h * 0.84
        const rx = 14 + Math.random() * 34
        const ry = 6  + Math.random() * 20
        ctx.save()
        ctx.translate(ax, ay); ctx.rotate(Math.random() * Math.PI)
        const ag = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
        ag.addColorStop(0,    'rgba(62,38,11,0.24)')
        ag.addColorStop(0.55, 'rgba(38,22,6,0.12)')
        ag.addColorStop(1,    'rgba(0,0,0,0)')
        ctx.fillStyle = ag; ctx.scale(1, ry / rx)
        ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }

      // 7. Heavy vignette — excavation pit, peering down from above
      const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.07, w * 0.5, h * 0.5, h * 0.84)
      vig.addColorStop(0,    'rgba(0,0,0,0)')
      vig.addColorStop(0.52, 'rgba(0,0,0,0.24)')
      vig.addColorStop(1,    'rgba(0,0,0,0.88)')
      ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h)

      // 8. Faint warm center pulse — something buried, barely glowing
      const warm = ctx.createRadialGradient(w * 0.52, h * 0.50, 0, w * 0.52, h * 0.50, h * 0.40)
      warm.addColorStop(0, 'rgba(210,100,22,0.08)')
      warm.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = warm; ctx.fillRect(0, 0, w, h)
    }, [])

    // ── Scrub: erase soil + update warm glow + sound ──────────────────────

    const scrub = useCallback((x: number, y: number, radius: number) => {
      const canvas = canvasRef.current
      if (!canvas || doneRef.current) return
      const ctx = canvas.getContext('2d')!

      // Erase soil (destination-out soft circle)
      ctx.globalCompositeOperation = 'destination-out'
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
      g.addColorStop(0,    'rgba(0,0,0,1)')
      g.addColorStop(0.52, 'rgba(0,0,0,0.90)')
      g.addColorStop(1,    'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'

      // Coverage tracking
      gridRef.current.mark(x / canvas.width, y / canvas.height, radius / canvas.width)
      const cov = gridRef.current.coverage

      // Warm glow builds as soil clears (direct DOM — no React re-render)
      if (glowRef.current) {
        glowRef.current.style.opacity = String(Math.min(cov * 0.95, 0.62))
      }

      // Sound (throttled)
      const now = Date.now()
      if (now - lastSoundRef.current > SOUND_THROTTLE_MS) {
        lastSoundRef.current = now
        const ac = getAudioCtx(audioCtxRef)
        if (ac) playScratch(ac)
      }

      // Threshold → trigger reveal
      if (!doneRef.current && cov >= REVEAL_THRESHOLD) {
        doneRef.current = true
        const ac = getAudioCtx(audioCtxRef)
        if (ac) playSingingBowl(ac)
        setPhase('reveal')
        setTimeout(() => { setPhase('done'); onRevealed() }, 520)
      }
    }, [onRevealed])

    // ── Expose scrubAt for CameraGesture (future) ─────────────────────────

    useImperativeHandle(ref, () => ({
      scrubAt(nx: number, ny: number) {
        const canvas = canvasRef.current
        if (!canvas) return
        scrub(nx * canvas.width, ny * canvas.height, BRUSH_SIZE_TOUCH)
      },
    }), [scrub])

    // ── Mouse ─────────────────────────────────────────────────────────────

    const getPos = (e: React.MouseEvent | MouseEvent) => {
      const c = canvasRef.current!; const r = c.getBoundingClientRect()
      return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
    }
    const onMouseDown = useCallback(() => { drawingRef.current = true }, [])
    const onMouseUp   = useCallback(() => { drawingRef.current = false }, [])
    const onMouseMove = useCallback((e: React.MouseEvent) => {
      if (!drawingRef.current) return
      const { x, y } = getPos(e); scrub(x, y, BRUSH_SIZE_MOUSE)
    }, [scrub])

    // ── Touch ─────────────────────────────────────────────────────────────

    const onTouchMove = useCallback((e: React.TouchEvent) => {
      e.preventDefault()
      const t = e.touches[0]; if (!t) return
      const c = canvasRef.current!; const r = c.getBoundingClientRect()
      scrub((t.clientX - r.left) * (c.width / r.width), (t.clientY - r.top) * (c.height / r.height), BRUSH_SIZE_TOUCH)
    }, [scrub])

    useEffect(() => {
      const up = () => { drawingRef.current = false }
      window.addEventListener('mouseup', up)
      return () => window.removeEventListener('mouseup', up)
    }, [])

    // ── Canvas init: runs after imgLoaded so canvas is in DOM ─────────────
    // (Without imgLoaded dep, canvas is null when effect first fires.)

    useEffect(() => {
      if (!imgLoaded) return
      const container = containerRef.current
      const canvas    = canvasRef.current
      if (!container || !canvas) return
      const resize = () => {
        canvas.width  = container.clientWidth
        canvas.height = container.clientHeight
        gridRef.current  = new CoverageGrid(GRID_COLS, GRID_ROWS)
        doneRef.current  = false
        if (glowRef.current) glowRef.current.style.opacity = '0'
        initCanvas()
      }
      resize()
      const ro = new ResizeObserver(resize)
      ro.observe(container)
      return () => ro.disconnect()
    }, [initCanvas, imgLoaded])

    // ── Cursor: custom amber circle while in cover phase ──────────────────

    const cursor = phase === 'cover'
      ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'36\' height=\'36\'%3E%3Ccircle cx=\'18\' cy=\'18\' r=\'15\' fill=\'none\' stroke=\'rgba(225,165,75,0.72)\' stroke-width=\'1.5\'/%3E%3Ccircle cx=\'18\' cy=\'18\' r=\'2.5\' fill=\'rgba(225,165,75,0.55)\'/%3E%3C/svg%3E") 18 18, crosshair'
      : 'default'

    return (
      <div ref={containerRef} className="absolute inset-0 select-none" style={{ cursor }}>

        {/* ── Layer 1: Underground ambient light (behind photo, warm offset) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 74% 60% at 59% 50%, rgba(205,118,38,0.12) 0%, rgba(145,72,16,0.055) 44%, transparent 72%)',
          }}
        />

        {/* ── Layer 2: Photo */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={() => setImgLoaded(true)}
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
          style={{
            padding: '72px 196px 72px 80px',
            transition: phase === 'reveal' ? 'filter 0.55s ease' : undefined,
            filter: phase === 'reveal' ? 'brightness(1.1) saturate(1.08)' : 'brightness(1)',
          }}
        />

        {/* ── Layer 3: Coverage warm glow (below canvas, revealed as soil clears) */}
        <div
          ref={glowRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: 0,
            transition: 'opacity 0.14s',
            background:
              'radial-gradient(ellipse 70% 58% at 59% 50%, rgba(235,148,52,0.34) 0%, rgba(185,94,22,0.16) 42%, transparent 72%)',
          }}
        />

        {/* ── Layer 4: Soil canvas */}
        <AnimatePresence>
          {phase !== 'done' && imgLoaded && (
            <motion.canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ touchAction: 'none' }}
              initial={{ opacity: 1 }}
              animate={{ opacity: phase === 'reveal' ? 0 : 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.25, 0, 0, 1] }}
              onMouseDown={onMouseDown}
              onMouseUp={onMouseUp}
              onMouseMove={onMouseMove}
              onTouchMove={onTouchMove}
              onTouchStart={(e) => e.preventDefault()}
            />
          )}
        </AnimatePresence>

        {/* ── Layer 5: Breathing pulse on soil surface (4s cycle, long rest) */}
        {phase === 'cover' && imgLoaded && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ opacity: [0, 0.75, 0] }}
            transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2.2 }}
            style={{
              background:
                'radial-gradient(ellipse 54% 44% at 50% 52%, rgba(195,105,28,0.09) 0%, transparent 100%)',
            }}
          />
        )}

        {/* ── Layer 6: Golden bloom flash on full reveal */}
        <AnimatePresence>
          {phase === 'reveal' && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.52, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.0, times: [0, 0.16, 1] }}
              style={{
                background:
                  'radial-gradient(ellipse 74% 62% at 59% 50%, rgba(255,215,90,0.40) 0%, rgba(215,142,42,0.14) 46%, transparent 72%)',
              }}
            />
          )}
        </AnimatePresence>

        {/* ── Loading spinner */}
        {!imgLoaded && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: '#120d05' }}
          >
            <motion.div
              className="w-6 h-6 rounded-full border-2"
              style={{ borderColor: 'rgba(215,145,58,0.52)', borderTopColor: 'transparent' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        )}

        {/* ── Hint text (appears after 1s delay once image is loaded) */}
        <AnimatePresence>
          {phase === 'cover' && imgLoaded && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 1.0, duration: 0.7 }}
              className="absolute bottom-8 left-0 right-0 text-center pointer-events-none text-xs tracking-widest"
              style={{ color: 'rgba(222,158,68,0.44)' }}
            >
              {t('excav.hint')}
            </motion.p>
          )}
        </AnimatePresence>

      </div>
    )
  }
)
