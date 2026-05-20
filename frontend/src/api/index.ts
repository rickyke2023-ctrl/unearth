import type {
  SystemStatus, StrataYear, GlobalStats, Event, Photo,
  Decision, StagingInfo, ScanProgress,
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

export function confirmStaging(): Promise<{ deleted_count: number; freed_bytes: number }> {
  return request('/api/staging/confirm', { method: 'POST', body: JSON.stringify({ confirm: true }) })
}

export function restoreFromStaging(photo_id: string): Promise<{ success: boolean; photo_id: string; restored_path: string }> {
  return request(`/api/staging/restore/${photo_id}`, { method: 'POST' })
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

// ── Preview ────────────────────────────────────────────────────────────────

export function previewUrl(photo_id: string): string {
  return `/preview/${photo_id}`
}
