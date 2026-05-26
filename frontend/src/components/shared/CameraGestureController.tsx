/**
 * CameraGestureController — loads MediaPipe Hands from CDN and tracks the
 * index-finger tip to drive scrubAt(nx, ny) on the active ScrubReveal canvas.
 *
 * CDN requirement: device must have internet access the first time this is
 * enabled. Subsequent loads use the browser cache.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const CDN_HANDS = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'

// Minimal types for the CDN-loaded MediaPipe Hands API
interface MPHands {
  setOptions(opts: Record<string, unknown>): void
  onResults(cb: (r: MPResults) => void): void
  send(input: { image: HTMLVideoElement }): Promise<void>
  close(): void
}

interface MPLandmark { x: number; y: number; z: number }
interface MPResults { multiHandLandmarks?: MPLandmark[][] }

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`CDN load failed: ${src}`))
    document.head.appendChild(s)
  })
}

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  onGesture: (nx: number, ny: number) => void
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function CameraGestureController({ onGesture }: Props) {
  const [enabled, setEnabled]   = useState(false)
  const [status, setStatus]     = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const videoRef     = useRef<HTMLVideoElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const handsRef     = useRef<MPHands | null>(null)
  const rafRef       = useRef<number>(0)
  const runningRef   = useRef(false)
  const onGestureRef = useRef(onGesture)

  useEffect(() => {
    onGestureRef.current = onGesture
  }, [onGesture])

  const stop = useCallback(() => {
    runningRef.current = false
    cancelAnimationFrame(rafRef.current)
    handsRef.current?.close()
    handsRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    setStatus('loading')
    setErrorMsg('')

    try {
      // 1. Load MediaPipe Hands from CDN
      await loadScript(CDN_HANDS)

      const HandsCtor = (window as any).Hands
      if (!HandsCtor) throw new Error('MediaPipe Hands not found after CDN load')

      // 2. Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      })
      streamRef.current = stream

      const video = videoRef.current!
      video.srcObject = stream
      await video.play()

      // 3. Initialise Hands
      const hands: MPHands = new HandsCtor({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      })
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,        // fastest model
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      })

      // 4. Results callback — landmark 8 = index finger tip
      hands.onResults((results: MPResults) => {
        if (!results.multiHandLandmarks?.length) return
        const tip = results.multiHandLandmarks[0][8]
        // Mirror X so moving right on screen maps to right on canvas
        onGestureRef.current(1 - tip.x, tip.y)

        // Draw a green dot on the preview canvas
        const cvs = canvasRef.current
        if (cvs) {
          const ctx = cvs.getContext('2d')
          if (ctx) {
            ctx.clearRect(0, 0, cvs.width, cvs.height)
            const px = (1 - tip.x) * cvs.width
            const py = tip.y * cvs.height
            ctx.beginPath()
            ctx.arc(px, py, 5, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(100,255,140,0.9)'
            ctx.fill()
          }
        }
      })

      handsRef.current = hands
      runningRef.current = true
      setStatus('ready')

      // 5. Frame loop at ~15 fps to stay light
      const processFrame = async () => {
        if (!runningRef.current || !videoRef.current) return
        try {
          await hands.send({ image: videoRef.current })
        } catch { /* video may not be ready yet */ }
        if (runningRef.current) {
          rafRef.current = window.setTimeout(processFrame, 66) as unknown as number
        }
      }
      processFrame()

    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Camera error')
      setStatus('error')
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    void (async () => {
      if (enabled) { await start() }
      else { stop() }
    })()
    return stop
  }, [enabled, start, stop])

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 50, userSelect: 'none' }}>

      {/* Toggle button */}
      <AnimatePresence>
        <motion.button
          key="toggle"
          onClick={() => setEnabled((v) => !v)}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          title={enabled ? 'Disable camera gesture' : 'Enable camera gesture'}
          style={{
            position: 'absolute',
            bottom: enabled ? 100 : 0,
            right: 0,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: enabled ? 'rgba(100,255,140,0.18)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${enabled ? 'rgba(100,255,140,0.5)' : 'rgba(255,255,255,0.15)'}`,
            color: enabled ? 'rgba(100,255,140,0.9)' : 'rgba(255,255,255,0.4)',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.2s, border 0.2s, bottom 0.3s',
          }}
        >
          ✋
        </motion.button>
      </AnimatePresence>

      {/* Camera preview + dot overlay */}
      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 10 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'relative', width: 120, height: 90 }}
          >
            {/* Status pill */}
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                zIndex: 2,
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.65)',
                color: status === 'ready'
                  ? 'rgba(100,255,140,0.9)'
                  : status === 'error'
                  ? 'rgba(255,100,80,0.9)'
                  : 'rgba(255,255,255,0.5)',
              }}
            >
              {status === 'loading' ? '…' : status === 'error' ? '!' : status === 'ready' ? '●' : ''}
            </div>

            <video
              ref={videoRef}
              width={120}
              height={90}
              muted
              playsInline
              style={{
                borderRadius: 8,
                transform: 'scaleX(-1)',
                opacity: status === 'ready' ? 0.75 : 0.3,
                display: 'block',
                background: '#000',
              }}
            />

            {/* Dot overlay (not mirrored — coordinates already flipped in onResults) */}
            <canvas
              ref={canvasRef}
              width={120}
              height={90}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 8,
                transform: 'scaleX(-1)',
                pointerEvents: 'none',
              }}
            />

            {status === 'error' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  color: 'rgba(255,100,80,0.8)',
                  background: 'rgba(0,0,0,0.7)',
                  borderRadius: 8,
                  padding: 4,
                  textAlign: 'center',
                }}
              >
                {errorMsg}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
