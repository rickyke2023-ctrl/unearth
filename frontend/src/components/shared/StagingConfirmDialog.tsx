import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getStaging, confirmStaging } from '../../api'
import { useAppStore } from '../../stores/appStore'
import { formatBytes } from '../../utils'
import type { StagingInfo } from '../../types'

export function StagingConfirmDialog() {
  const { showStagingDialog, setShowStagingDialog } = useAppStore()
  const [info, setInfo] = useState<StagingInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (showStagingDialog) {
      getStaging().then(setInfo).catch(() => {})
      setConfirmed(false)
    }
  }, [showStagingDialog])

  const handleConfirm = async () => {
    if (!confirmed) return
    setLoading(true)
    try {
      await confirmStaging()
      setShowStagingDialog(false)
    } catch (e: any) {
      alert(`释放失败：${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {showStagingDialog && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(10,10,15,0.85)' }}
          onClick={() => setShowStagingDialog(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="glass rounded-xl p-8 w-full max-w-md flex flex-col gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-light tracking-widest mb-2" style={{ color: 'var(--color-leave)' }}>
                确认永久释放空间
              </h2>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                这些文件已被「留在这里」。确认后将永久删除，无法恢复。
              </p>
            </div>

            {info && (
              <div className="glass rounded-lg p-4 flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--color-text-secondary)' }}>文件数量</span>
                  <span className="font-tabular">{info.total_count.toLocaleString()} 个</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--color-text-secondary)' }}>释放空间</span>
                  <span className="font-tabular" style={{ color: 'var(--color-keep)' }}>
                    {formatBytes(info.total_size_bytes)}
                  </span>
                </div>
              </div>
            )}

            <label className="flex items-center gap-3 text-sm cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="accent-current"
              />
              我确认这些文件可以永久删除
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => setShowStagingDialog(false)}
                className="flex-1 py-3 rounded text-sm tracking-wider transition-opacity hover:opacity-70"
                style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={!confirmed || loading}
                className="flex-1 py-3 rounded text-sm tracking-wider transition-opacity disabled:opacity-30"
                style={{ background: 'var(--color-leave)', color: '#fff' }}
              >
                {loading ? '释放中…' : '确认释放'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
