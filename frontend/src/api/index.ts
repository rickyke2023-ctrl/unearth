import type {
  SystemStatus, StrataYear, GlobalStats, Event, Photo,
  Decision, StagingInfo, TrashInfo, ScanProgress, ExcavationResult,
} from '../types'

const BASE = ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.error ?? `HTTP ${res.status}`), { code: err.code })
  }
  return res.json()
}

// ── System ─────────────────────────────────────────────────────────────────

export function getStatus(): Promise<SystemStatus> {
  return request('/api/status')
}

export function startScan(root_path: string): Promise<{ task_id: string; status: string }> {
  return request('/api/scan', { method: 'POST', body: JSON.stringify({ root_path }) })
}

export function subscribeScanProgress(
  onProgress: (p: ScanProgress) => void,
  onDone: () => void,
  onError: (e: unknown) => void,
): () => void {
  const es = new EventSource('/api/scan/progress')
  es.onmessage = (e) => {
    const data: ScanProgress = JSON.parse(e.data)
    if (data.phase === 'done') { onDone(); es.close() }
    else onProgress(data)
  }
  es.onerror = (e) => { onError(e); es.close() }
  return () => es.close()
}

// ── Strata ─────────────────────────────────────────────────────────────────

export function getStrata(): Promise<{ years: StrataYear[]; global_stats: GlobalStats }> {
  return request('/api/strata')
}

// ── Events ─────────────────────────────────────────────────────────────────

export function getEvents(year: number, month: number): Promise<{ year: number; month: number; events: Event[] }> {
  return request(`/api/events?year=${year}&month=${month}`)
}

export function getEventPhotos(eventId: string): Promise<{ event_id: string; photos: Photo[]; total: number; decided: number }> {
  return request(`/api/events/${eventId}/photos`)
}

// ── Decisions ──────────────────────────────────────────────────────────────

export function postDecisions(
  decisions: Array<{ photo_id: string; decision: Decision; is_book_candidate?: boolean }>,
): Promise<{ processed: number; staging_added: number; freed_bytes_preview: number }> {
  return request('/api/decisions', { method: 'POST', body: JSON.stringify({ decisions }) })
}

export function undoDecision(photo_id: string): Promise<{ success: boolean; previous_decision: Decision; restored_file: boolean }> {
  return request('/api/decisions/undo', { method: 'POST', body: JSON.stringify({ photo_id }) })
}

export function toggleBookCandidate(photo_id: string): Promise<{ photo_id: string; is_book_candidate: boolean }> {
  return request(`/api/book-candidates/${photo_id}`, { method: 'POST' })
}

// ── Staging ────────────────────────────────────────────────────────────────

export function getStaging(): Promise<StagingInfo> {
  return request('/api/staging')
}

/** 把 staging 照片移入 trash（30天缓冲，不立刻删文件） */
export function confirmStaging(photo_ids?: string[]): Promise<{ trashed_count: number; deleted_count: number; freed_bytes: number }> {
  return request('/api/staging/confirm', {
    method: 'POST',
    body: JSON.stringify({ confirm: true, ...(photo_ids ? { photo_ids } : {}) }),
  })
}

export function restoreFromStaging(photo_id: string): Promise<{ photo_id: string; restored_to: string }> {
  return request('/api/staging/restore', { method: 'POST', body: JSON.stringify({ photo_id }) })
}

// ── Trash ──────────────────────────────────────────────────────────────────

export function getTrash(): Promise<TrashInfo> {
  return request('/api/trash')
}

/** photo_ids 为空时清空全部 trash */
export function purgeTrash(photo_ids?: string[]): Promise<{ purged_count: number; freed_bytes: number; errors: unknown[] }> {
  return request('/api/trash/purge', {
    method: 'DELETE',
    body: JSON.stringify({ photo_ids: photo_ids ?? [] }),
  })
}

// ── Book candidates ────────────────────────────────────────────────────────

export function getBookCandidates(): Promise<{ total: number; candidates: Partial<Photo>[] }> {
  return request('/api/book-candidates')
}

// ── Geocoding ──────────────────────────────────────────────────────────────

export function triggerGeocode(limit = 200): Promise<{ status: string; limit: number }> {
  return request(`/api/geocode/trigger?limit=${limit}`, { method: 'POST' })
}

// ── Day count ──────────────────────────────────────────────────────────────

export function getDayPhotoCount(date: string): Promise<{ date: string; count: number }> {
  return request(`/api/photos/day-count?date=${date}`)
}

// ── Excavation ────────────────────────────────────────────────────────────

/** 今日发掘：Task D 后端就绪后自动生效，现在用 story/today 作 fallback */
export async function getExcavationToday(limit = 20): Promise<ExcavationResult> {
  // 先尝试专用接口（Task D 完成后可用）
  try {
    return await request<ExcavationResult>(`/api/excavation/today?limit=${limit}`)
  } catch {
    // Fallback：用 story/today 的 cross_year，补充 recent undecided
    const storyRes = await request<{
      cross_year: { photos: Photo[]; total_count: number } | null
    }>(`/api/story/today?limit=${limit}`)
    const photos = storyRes.cross_year?.photos ?? []
    return {
      date_label: new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }),
      source: 'cross_year',
      photos: photos.slice(0, limit),
      total: Math.min(photos.length, limit),
      cross_year_count: photos.length,
      supplemented: false,
    }
  }
}

// ── Preview ────────────────────────────────────────────────────────────────

export function previewUrl(photo_id: string): string {
  return `/preview/${photo_id}`
}
