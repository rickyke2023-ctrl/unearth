import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ScrubRevealProps {
  src: string
  alt?: string
  onRevealed: () => void   // 拨开阈值达到时调用
}

const REVEAL_THRESHOLD = 0.72   // 72% 区域拨开后自动完成
const BRUSH_SIZE_MOUSE = 58     // 鼠标笔刷半径 px
const BRUSH_SIZE_TOUCH = 72     // 触摸笔刷半径 px
const GRID_COLS = 32            // coverage 网格列数（低分辨率覆盖率检测）
const GRID_ROWS = 32

// ── 低分辨率覆盖率网格 ──────────────────────────────────────────────────────

class CoverageGrid {
  private cells: Uint8Array
  private cols: number
  private rows: number
  cleared = 0

  constructor(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
    this.cells = new Uint8Array(cols * rows)
  }

  mark(nx: number, ny: number, brushFrac: number) {
    // nx, ny: 0-1 归一化坐标; brushFrac: 笔刷半径占画布宽的比例
    const cx = nx * this.cols
    const cy = ny * this.rows
    const r = brushFrac * this.cols
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

  get coverage() {
    return this.cleared / (this.cols * this.rows)
  }
}

// ── ScrubReveal ─────────────────────────────────────────────────────────────

export function ScrubReveal({ src, alt = '', onRevealed }: ScrubRevealProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef    = useRef<HTMLImageElement>(null)
  const gridRef   = useRef<CoverageGrid>(new CoverageGrid(GRID_COLS, GRID_ROWS))
  const drawingRef = useRef(false)
  const doneRef    = useRef(false)

  const [phase, setPhase] = useState<'cover' | 'reveal' | 'done'>('cover')
  const [imgLoaded, setImgLoaded] = useState(false)

  // ── Canvas 初始化：填充深色岩土遮罩 ──────────────────────────────────────

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width
    const h = canvas.height

    // 深棕色土层底色
    ctx.fillStyle = '#16100a'
    ctx.fillRect(0, 0, w, h)

    // 颗粒噪点纹理（随机点阵模拟土壤质感）
    const imageData = ctx.getImageData(0, 0, w, h)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 28
      data[i]     = Math.min(255, Math.max(0, data[i]     + noise))         // R
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise * 0.6))  // G
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise * 0.3))  // B
    }
    ctx.putImageData(imageData, 0, 0)

    // 边缘加深渐变（四周更暗，中间稍亮——像洞口）
    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, h * 0.85)
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, w, h)
  }, [])

  // ── 在 canvas 上擦出一个笔刷圆 ───────────────────────────────────────────

  const scrub = useCallback((x: number, y: number, radius: number) => {
    const canvas = canvasRef.current
    if (!canvas || doneRef.current) return
    const ctx = canvas.getContext('2d')!

    ctx.globalCompositeOperation = 'destination-out'

    // 软边圆：中心完全透明，边缘渐隐
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
    grad.addColorStop(0,   'rgba(0,0,0,1)')
    grad.addColorStop(0.6, 'rgba(0,0,0,0.85)')
    grad.addColorStop(1,   'rgba(0,0,0,0)')

    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalCompositeOperation = 'source-over'

    // 更新覆盖率网格
    const nx = x / canvas.width
    const ny = y / canvas.height
    const brushFrac = radius / canvas.width
    gridRef.current.mark(nx, ny, brushFrac)

    if (!doneRef.current && gridRef.current.coverage >= REVEAL_THRESHOLD) {
      doneRef.current = true
      setPhase('reveal')
      setTimeout(() => {
        setPhase('done')
        onRevealed()
      }, 520)
    }
  }, [onRevealed])

  // ── 鼠标事件 ─────────────────────────────────────────────────────────────

  const getCanvasPos = (e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    }
  }

  const onMouseDown = useCallback(() => { drawingRef.current = true }, [])
  const onMouseUp   = useCallback(() => { drawingRef.current = false }, [])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawingRef.current) return
    const { x, y } = getCanvasPos(e)
    scrub(x, y, BRUSH_SIZE_MOUSE)
  }, [scrub])

  // ── 触摸事件 ─────────────────────────────────────────────────────────────

  const getTouchPos = (touch: React.Touch) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top)  * (canvas.height / rect.height),
    }
  }

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    const touch = e.touches[0]
    if (!touch) return
    const { x, y } = getTouchPos(touch)
    scrub(x, y, BRUSH_SIZE_TOUCH)
  }, [scrub])

  // ── 全局 mouseup（防止拖出 canvas 后不松开） ──────────────────────────────

  useEffect(() => {
    const up = () => { drawingRef.current = false }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // ── Canvas 尺寸与初始化 ───────────────────────────────────────────────────
  //
  // 注意：canvas 只在 imgLoaded=true 后才挂载到 DOM（条件渲染）。
  // 因此这个 effect 必须把 imgLoaded 也列为依赖，这样图片加载完成、
  // canvas 出现在 DOM 后，effect 才会重新执行并完成初始化。

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!imgLoaded) return                 // canvas 还未挂载，等下一轮
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resize = () => {
      canvas.width  = container.clientWidth
      canvas.height = container.clientHeight
      gridRef.current = new CoverageGrid(GRID_COLS, GRID_ROWS)
      doneRef.current = false
      initCanvas()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [initCanvas, imgLoaded])              // ← imgLoaded 是关键依赖

  const cursor = phase === 'cover'
    ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\'%3E%3Ccircle cx=\'16\' cy=\'16\' r=\'14\' fill=\'none\' stroke=\'rgba(255,200,120,0.6)\' stroke-width=\'2\'/%3E%3C/svg%3E") 16 16, crosshair'
    : 'default'

  return (
    <div ref={containerRef} className="absolute inset-0 select-none" style={{ cursor }}>

      {/* 底层：照片（始终渲染，canvas 在上面遮住它） */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={() => setImgLoaded(true)}
        className="absolute inset-0 w-full h-full object-contain"
        draggable={false}
        style={{
          padding: '72px 196px 72px 80px',
          transition: phase === 'reveal' ? 'filter 0.5s ease' : undefined,
          filter: phase === 'reveal' ? 'brightness(1.08) saturate(1.06)' : 'brightness(1)',
        }}
      />

      {/* 岩土遮罩 canvas */}
      <AnimatePresence>
        {phase !== 'done' && imgLoaded && (
          <motion.canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ touchAction: 'none' }}
            animate={{ opacity: phase === 'reveal' ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0, 0, 1] }}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseMove={onMouseMove}
            onTouchMove={onTouchMove}
            onTouchStart={(e) => e.preventDefault()}
          />
        )}
      </AnimatePresence>

      {/* 加载中：图片还没 ready 时 */}
      {!imgLoaded && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#16100a' }}>
          <motion.div
            className="w-6 h-6 rounded-full border-2"
            style={{ borderColor: 'rgba(255,180,80,0.4)', borderTopColor: 'transparent' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      )}

      {/* 提示文字（还没开始刷时） */}
      <AnimatePresence>
        {phase === 'cover' && imgLoaded && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="absolute bottom-8 left-0 right-0 text-center pointer-events-none text-xs tracking-widest"
            style={{ color: 'rgba(255,180,80,0.45)' }}
          >
            拨开表土，取出记忆
          </motion.p>
        )}
      </AnimatePresence>

    </div>
  )
}
