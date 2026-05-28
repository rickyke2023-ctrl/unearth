/**
 * PoemView — 诗集打字机模式
 *
 * 左侧：全屏照片
 * 右侧：gemma4 实时生成 150 字散文诗，打字机逐字出现
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { previewUrl } from '../../api'
import { useAppStore } from '../../stores/appStore'

// ── Types ──────────────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchRandomPhotoId(): Promise<string | null> {
  try {
    const res = await fetch('/api/excavation/today')
    if (!res.ok) return null
    const data = await res.json()
    const photos: { id: string }[] = data.photos ?? data ?? []
    if (photos.length === 0) return null
    return photos[Math.floor(Math.random() * photos.length)].id
  } catch {
    return null
  }
}

// ── Main component ─────────────────────────────────────────────────────────

export function PoemView() {
  const { setView } = useAppStore()
  const [photoId, setPhotoId] = useState<string | null>(null)
  const [poem, setPoem] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [showCursor, setShowCursor] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)
  const textRef = useRef<HTMLDivElement>(null)

  // 加载随机照片
  const loadPhoto = useCallback(async () => {
    setPoem('')
    setStatus('loading')
    const id = await fetchRandomPhotoId()
    if (id) {
      setPhotoId(id)
      setStatus('idle')
    } else {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    loadPhoto()
    return () => { abortRef.current?.() }
  }, [loadPhoto])

  // 自动滚到底部
  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight
    }
  }, [poem])

  // 开始生成
  const startGeneration = useCallback(() => {
    if (!photoId || status === 'streaming') return
    abortRef.current?.()

    setPoem('')
    setStatus('streaming')
    setShowCursor(true)

    const es = new EventSource(`/api/poem/stream/${photoId}`)
    let buffer = ''

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.done) {
          es.close()
          setStatus('done')
          setShowCursor(false)
          return
        }
        if (data.token) {
          buffer += data.token
          setPoem(buffer)
        }
      } catch { /* ignore parse errors */ }
    }

    es.onerror = () => {
      es.close()
      setStatus('done')
      setShowCursor(false)
    }

    abortRef.current = () => {
      es.close()
      setStatus('idle')
      setShowCursor(false)
    }
  }, [photoId, status])

  // 换一张
  const nextPhoto = useCallback(() => {
    abortRef.current?.()
    setPoem('')
    setStatus('loading')
    fetchRandomPhotoId().then((id) => {
      setPhotoId(id)
      setStatus('idle')
    })
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        background: 'var(--color-void)',
      }}
    >
      {/* ── 左侧：照片 ─────────────────────────────────────── */}
      <div style={{ flex: '0 0 55%', position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {photoId && (
            <motion.img
              key={photoId}
              src={previewUrl(photoId)}
              initial={{ opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.25, 0, 0, 1] }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          )}
        </AnimatePresence>

        {/* 渐变遮罩（右侧过渡） */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to right, transparent 70%, var(--color-void) 100%)',
          pointerEvents: 'none',
        }} />

        {/* 返回按钮 */}
        <button
          onClick={() => setView('gateway')}
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            color: 'rgba(255,255,255,0.7)',
            padding: '6px 14px',
            fontSize: 12,
            letterSpacing: '0.1em',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          ← 返回
        </button>
      </div>

      {/* ── 右侧：诗 ───────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '48px 40px 48px 32px',
          gap: 32,
        }}
      >
        {/* 标题区 */}
        <div>
          <p style={{
            fontSize: 10,
            letterSpacing: '0.25em',
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            诗集模式 · Poem
          </p>
          <h2 style={{
            fontSize: 18,
            fontWeight: 300,
            color: 'var(--color-text-secondary)',
            letterSpacing: '0.05em',
          }}>
            一张照片，一段文字
          </h2>
        </div>

        {/* 诗文区 */}
        <div
          ref={textRef}
          style={{
            flex: 1,
            maxHeight: '50vh',
            overflowY: 'auto',
            position: 'relative',
          }}
        >
          <AnimatePresence mode="wait">
            {status === 'idle' && poem === '' && (
              <motion.p
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  color: 'var(--color-text-muted)',
                  fontSize: 14,
                  lineHeight: 1.8,
                  fontStyle: 'italic',
                }}
              >
                点击「生成」，让这张照片说话。
              </motion.p>
            )}
          </AnimatePresence>

          {poem && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <p style={{
                color: 'var(--color-text-primary)',
                fontSize: 15,
                lineHeight: 2,
                letterSpacing: '0.04em',
                whiteSpace: 'pre-wrap',
                fontWeight: 300,
              }}>
                {poem}
                {showCursor && (
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    style={{ marginLeft: 1, color: 'var(--color-star)' }}
                  >
                    ▌
                  </motion.span>
                )}
              </p>
            </motion.div>
          )}
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={startGeneration}
            disabled={!photoId || status === 'streaming' || status === 'loading'}
            style={{
              padding: '10px 24px',
              background: status === 'streaming'
                ? 'rgba(232,200,120,0.08)'
                : 'rgba(232,200,120,0.15)',
              border: '1px solid rgba(232,200,120,0.3)',
              borderRadius: 4,
              color: status === 'streaming' ? 'rgba(232,200,120,0.5)' : '#E8C878',
              fontSize: 13,
              letterSpacing: '0.1em',
              cursor: status === 'streaming' || status === 'loading' ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {status === 'streaming' ? '生成中…' : status === 'done' ? '重新生成' : '生成'}
          </button>

          <button
            onClick={nextPhoto}
            disabled={status === 'streaming'}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              color: 'var(--color-text-secondary)',
              fontSize: 13,
              letterSpacing: '0.1em',
              cursor: status === 'streaming' ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            换一张
          </button>
        </div>

        {status === 'error' && (
          <p style={{ color: 'rgba(255,100,100,0.7)', fontSize: 12 }}>
            无法加载照片，请检查后端是否运行。
          </p>
        )}
      </div>
    </div>
  )
}
