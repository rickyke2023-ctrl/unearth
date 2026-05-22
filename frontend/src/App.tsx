import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getStatus } from './api'
import { useAppStore } from './stores/appStore'
import { StrataView } from './components/StrataView'
import { SiteView } from './components/SiteView'
import { DecisionView } from './components/DecisionView'
import { ExcavationView } from './components/ExcavationView'
import { KeptView } from './components/KeptView'
import { StoryView } from './components/StoryView'
import { BookView } from './components/BookView'
import { AlmanacView } from './components/AlmanacView'
import { StagingConfirmDialog } from './components/shared/StagingConfirmDialog'
import { ScanSetup, ScanProgressView } from './components/shared/ScanProgress'

function AppContent() {
  const { view, systemStatus, isScanning } = useAppStore()

  if (isScanning) return <ScanProgressView />
  if (!systemStatus) return <LoadingScreen />
  if (!systemStatus.scan_completed) return <ScanSetup />

  return (
    <AnimatePresence mode="wait">
      {view === 'strata' && (
        <motion.div key="strata" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <StrataView />
        </motion.div>
      )}
      {view === 'site' && (
        <motion.div key="site" className="h-full" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          <SiteView />
        </motion.div>
      )}
      {view === 'decision' && (
        <motion.div key="decision" className="h-full" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          <DecisionView />
        </motion.div>
      )}
      {view === 'excavation' && (
        <motion.div key="excavation" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <ExcavationView />
        </motion.div>
      )}
      {view === 'kept' && (
        <motion.div key="kept" className="h-full" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          <KeptView />
        </motion.div>
      )}
      {(view === 'story' || view === 'story-theme') && (
        <motion.div key="story" className="h-full" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          <StoryView />
        </motion.div>
      )}
      {view === 'book' && (
        <motion.div key="book" className="h-full" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          <BookView />
        </motion.div>
      )}
      {view === 'almanac' && (
        <motion.div key="almanac" className="h-full" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          <AlmanacView />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function App() {
  const { setSystemStatus, setScanState } = useAppStore()

  useEffect(() => {
    getStatus()
      .then((status) => {
        setSystemStatus(status)
        if (status.status === 'scanning') {
          setScanState(true)
        }
      })
      .catch(() => {
        // Backend not running — show scan setup with a synthetic "no db" status
        setSystemStatus({
          status: 'no_db',
          db_exists: false,
          total_photos: 0,
          total_size_bytes: 0,
          scan_completed: false,
        })
      })
  }, [setSystemStatus, setScanState])

  return (
    <div className="h-full" style={{ background: 'var(--color-void)' }}>
      <AppContent />
      <StagingConfirmDialog />
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="h-full flex items-center justify-center flex-col gap-4">
      <motion.div
        className="w-8 h-8 rounded-full border-2"
        style={{ borderColor: 'var(--strata-2022)', borderTopColor: 'transparent' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      <p className="text-xs tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
        连接后端…
      </p>
    </div>
  )
}
