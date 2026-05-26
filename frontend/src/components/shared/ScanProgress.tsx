import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { startScan, subscribeScanProgress, getStatus } from '../../api'
import { useAppStore } from '../../stores/appStore'
import type { ScanProgress as ScanProgressType } from '../../types'

export function ScanSetup() {
  const [rootPath, setRootPath] = useState('')
  const [error, setError] = useState('')
  const { setScanState } = useAppStore()

  const handleStart = async () => {
    if (!rootPath.trim()) { setError('请输入硬盘路径'); return }
    setError('')
    try {
      await startScan(rootPath.trim())
      setScanState(true, 0, 'indexing')
    } catch (e: unknown) {
      setError((e as Error).message ?? '启动扫描失败')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <div className="text-center">
        <h1 className="text-2xl font-light tracking-widest mb-2" style={{ color: 'var(--strata-2022)' }}>
          显影 · Unearth
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }} className="text-sm tracking-wider">
          A Memory Excavation
        </p>
      </div>

      <div className="glass rounded-lg p-8 w-full max-w-md flex flex-col gap-4">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          首次使用，请指定照片所在硬盘的根目录路径
        </p>
        <input
          type="text"
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          placeholder="/Volumes/MyHDD/Photos"
          className="w-full bg-transparent border rounded px-4 py-3 text-sm outline-none focus:border-white/30 transition-colors"
          style={{ borderColor: 'var(--color-glass-border)', color: 'var(--color-text-primary)' }}
        />
        {error && <p className="text-xs" style={{ color: '#E8887A' }}>{error}</p>}
        <button
          onClick={handleStart}
          className="w-full py-3 rounded text-sm tracking-widest transition-opacity hover:opacity-80"
          style={{ background: 'var(--strata-2022)', color: '#0A0A0F' }}
        >
          开始扫描
        </button>
      </div>
    </div>
  )
}

export function ScanProgressView() {
  const [progress, setProgress] = useState<ScanProgressType | null>(null)
  const { setScanState, setSystemStatus } = useAppStore()

  useEffect(() => {
    const unsub = subscribeScanProgress(
      setProgress,
      async () => {
        setScanState(false)
        try {
          const status = await getStatus()
          setSystemStatus(status)
        } catch { /* status unavailable, continue */ }
      },
      () => setScanState(false),
    )
    return unsub
  }, [setScanState, setSystemStatus])

  const phaseLabel: Record<string, string> = {
    indexing: '建立索引',
    pairing: '识别配对',
    clustering: '聚合事件',
    done: '完成',
  }

  const pct = progress
    ? Math.round((progress.scanned / Math.max(progress.total_estimated, 1)) * 100)
    : 0

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <div className="text-center">
        <h1 className="text-2xl font-light tracking-widest mb-2" style={{ color: 'var(--strata-2022)' }}>
          正在挖掘地层
        </h1>
        <p className="text-sm tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
          {phaseLabel[progress?.phase ?? ''] ?? '准备中'}
        </p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-3">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-glass)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'var(--strata-2022)' }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ ease: 'linear', duration: 0.3 }}
          />
        </div>
        <div className="flex justify-between text-xs font-tabular" style={{ color: 'var(--color-text-secondary)' }}>
          <span>{progress?.scanned.toLocaleString() ?? 0} 张</span>
          <span>{pct}%</span>
        </div>
        {progress?.current_file && (
          <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
            {progress.current_file}
          </p>
        )}
      </div>
    </div>
  )
}
