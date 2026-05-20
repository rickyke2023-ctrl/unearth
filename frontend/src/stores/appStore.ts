import { create } from 'zustand'
import type { AppView, Photo, GlobalStats, SystemStatus, Event } from '../types'

interface DecisionHistoryItem {
  photo_id: string
  previous_decision: import('../types').Decision
}

interface AppState {
  view: AppView
  systemStatus: SystemStatus | null
  globalStats: GlobalStats | null

  // Navigation context
  selectedYear: number | null
  selectedMonth: number | null
  selectedEventId: string | null

  // Decision view state
  monthEvents: Event[]
  eventPhotos: Photo[]
  currentPhotoIndex: number
  decisionHistory: DecisionHistoryItem[]
  sessionKept: number
  sessionLeft: number
  sessionFreedBytes: number

  // Scan state
  isScanning: boolean
  scanProgress: number
  scanPhase: string

  // UI state
  showStagingDialog: boolean
  showLightbox: boolean

  // Milestone / gamification
  totalDecisions: number
  milestoneShown: Set<string>
  incrementDecisions: () => void
  markMilestone: (key: string) => void
  hasMilestone: (key: string) => boolean

  // Actions
  setView: (view: AppView) => void
  setSystemStatus: (s: SystemStatus) => void
  setGlobalStats: (s: GlobalStats) => void
  navigateToSite: (year: number, month: number) => void
  navigateToDecision: (eventId: string) => void
  navigateBack: () => void
  setMonthEvents: (events: Event[]) => void
  setEventPhotos: (photos: Photo[]) => void
  advancePhoto: () => void
  goToNextEvent: () => boolean
  updatePhotoDecision: (photo_id: string, decision: import('../types').Decision, is_book_candidate?: boolean) => void
  pushHistory: (item: DecisionHistoryItem) => void
  popHistory: () => DecisionHistoryItem | null
  addSessionStats: (kept: number, left: number, freed: number) => void
  setScanState: (scanning: boolean, progress?: number, phase?: string) => void
  setCurrentPhotoIndex: (i: number) => void
  setShowStagingDialog: (v: boolean) => void
  setShowLightbox: (v: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'strata',
  systemStatus: null,
  globalStats: null,
  selectedYear: null,
  selectedMonth: null,
  selectedEventId: null,
  monthEvents: [],
  eventPhotos: [],
  currentPhotoIndex: 0,
  decisionHistory: [],
  sessionKept: 0,
  sessionLeft: 0,
  sessionFreedBytes: 0,
  isScanning: false,
  scanProgress: 0,
  scanPhase: '',
  showStagingDialog: false,
  showLightbox: false,

  totalDecisions: 0,
  milestoneShown: new Set<string>(),
  incrementDecisions: () => set((s) => ({ totalDecisions: s.totalDecisions + 1 })),
  markMilestone: (key) => set((s) => ({ milestoneShown: new Set([...s.milestoneShown, key]) })),
  hasMilestone: (key) => get().milestoneShown.has(key),

  setView: (view) => set({ view }),
  setSystemStatus: (systemStatus) => set({ systemStatus }),
  setGlobalStats: (globalStats) => set({ globalStats }),

  navigateToSite: (year, month) =>
    set({ view: 'site', selectedYear: year, selectedMonth: month }),

  navigateToDecision: (eventId) =>
    set({ view: 'decision', selectedEventId: eventId, currentPhotoIndex: 0 }),

  navigateBack: () => {
    const { view } = get()
    if (view === 'decision') set({ view: 'site', selectedEventId: null, eventPhotos: [] })
    else if (view === 'site') set({ view: 'strata', selectedYear: null, selectedMonth: null })
  },

  setMonthEvents: (events) => set({ monthEvents: events }),

  setEventPhotos: (photos) => set({ eventPhotos: photos, currentPhotoIndex: 0 }),

  // 允许越界到 length（让 currentPhoto 变 undefined，触发 AllDoneState）
  advancePhoto: () => {
    const { currentPhotoIndex, eventPhotos } = get()
    if (currentPhotoIndex < eventPhotos.length) {
      set({ currentPhotoIndex: currentPhotoIndex + 1 })
    }
  },

  // 跳到当前月内下一个未完成事件；找不到返回 false（提示用户全部完成）
  goToNextEvent: () => {
    const { monthEvents, selectedEventId } = get()
    if (monthEvents.length === 0) return false
    const currentIdx = monthEvents.findIndex((e) => e.id === selectedEventId)
    // 从当前事件后面找第一个 status != 'completed'
    for (let i = currentIdx + 1; i < monthEvents.length; i++) {
      if (monthEvents[i].status !== 'completed') {
        set({ selectedEventId: monthEvents[i].id, currentPhotoIndex: 0, eventPhotos: [] })
        return true
      }
    }
    // 后面没有，从头再找
    for (let i = 0; i < currentIdx; i++) {
      if (monthEvents[i].status !== 'completed') {
        set({ selectedEventId: monthEvents[i].id, currentPhotoIndex: 0, eventPhotos: [] })
        return true
      }
    }
    return false
  },

  updatePhotoDecision: (photo_id, decision, is_book_candidate) =>
    set((state) => ({
      eventPhotos: state.eventPhotos.map((p) =>
        p.id === photo_id
          ? { ...p, decision, ...(is_book_candidate !== undefined ? { is_book_candidate } : {}) }
          : p,
      ),
    })),

  pushHistory: (item) =>
    set((state) => ({ decisionHistory: [...state.decisionHistory, item] })),

  popHistory: () => {
    const { decisionHistory } = get()
    if (decisionHistory.length === 0) return null
    const item = decisionHistory[decisionHistory.length - 1]
    set({ decisionHistory: decisionHistory.slice(0, -1) })
    return item
  },

  addSessionStats: (kept, left, freed) =>
    set((state) => ({
      sessionKept: state.sessionKept + kept,
      sessionLeft: state.sessionLeft + left,
      sessionFreedBytes: state.sessionFreedBytes + freed,
    })),

  setScanState: (scanning, progress = 0, phase = '') =>
    set({ isScanning: scanning, scanProgress: progress, scanPhase: phase }),

  setCurrentPhotoIndex: (i) => set({ currentPhotoIndex: i }),
  setShowStagingDialog: (v) => set({ showStagingDialog: v }),
  setShowLightbox: (v) => set({ showLightbox: v }),
}))
