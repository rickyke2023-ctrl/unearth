export type FileType = 'RAW_SONY' | 'RAW_FUJI' | 'JPEG' | 'HEIF' | 'HEIC' | 'PNG'
export type Decision = 'keep' | 'leave' | 'skip' | null
export type EventStatus = 'pending' | 'in_progress' | 'completed'
export type ScanPhase = 'indexing' | 'pairing' | 'clustering' | 'done'

export interface Photo {
  id: string
  file_path: string
  file_name: string
  file_type: FileType
  file_size_bytes: number
  shot_at: string
  year: number
  month: number
  gps_lat?: number
  gps_lng?: number
  gps_city?: string
  gps_country?: string
  camera_model?: string
  paired_photo_id?: string
  has_xmp_sidecar: boolean
  decision: Decision
  is_book_candidate: boolean
  event_id: string
  preview_ready: boolean
}

export interface Event {
  id: string
  year: number
  month: number
  started_at: string
  ended_at: string
  photo_count: number
  decided_count: number
  cover_photo_id?: string
  primary_location?: string
  status: EventStatus
}

export interface MonthSummary {
  year: number
  month: number
  photo_count: number
  event_count: number
  decided_count: number
  kept_count: number
  left_count: number
  size_bytes: number
  freed_bytes: number
  status: EventStatus
  primary_locations: string[]
  strata_color: string
}

export interface StrataYear {
  year: number
  total_photos: number
  total_size_bytes: number
  decided_count: number
  months: MonthSummary[]
}

export interface GlobalStats {
  total_photos: number
  total_size_bytes: number
  decided_count: number
  kept_count: number
  left_count: number
  freed_bytes: number
  book_candidates_count: number
}

export interface SystemStatus {
  status: 'ready' | 'scanning' | 'error' | 'no_db'
  db_exists: boolean
  total_photos: number
  total_size_bytes: number
  scan_completed: boolean
  last_scan_at?: string
}

export interface ScanProgress {
  scanned: number
  total_estimated: number
  current_file: string
  phase: ScanPhase
}

export interface StagingPhoto {
  photo_id: string
  original_path: string
  filename: string
  staging_path: string
  file_size_bytes: number
  date_taken: string | null
  location: string | null
  left_at: string | null
  thumbnail_available: boolean
}

export interface TrashPhoto extends StagingPhoto {
  trashed_at: string
  expires_at: string
  days_remaining: number
}

export interface TrashSummary {
  count: number
  size_mb: number
  oldest_expires_at: string | null
}

export interface StagingInfo {
  total_count: number
  total_size_mb: number
  photos: StagingPhoto[]
  trash_summary: TrashSummary
}

export interface TrashInfo {
  total_count: number
  total_size_mb: number
  photos: TrashPhoto[]
}

export interface ExcavationResult {
  date_label: string
  source: 'cross_year' | 'supplemented'
  photos: Photo[]
  total: number
  cross_year_count: number
  supplemented: boolean
}

export interface KeptResult {
  total_count: number
  by_year: Record<string, number>
  photos: Photo[]
}

export type AppView = 'strata' | 'site' | 'decision' | 'excavation' | 'kept' | 'story' | 'story-theme'

// ── Story / Theme types ────────────────────────────────────────────────────

export interface StoryPhoto {
  photo_id: string
  shot_at: string | null
  year: number
  filename: string
  thumbnail_available: boolean
  gps_city?: string | null
}

export interface TimeSegments {
  morning: number
  afternoon: number
  evening: number
  night: number
}

export interface FullDayStory {
  type: 'full_day'
  title: string
  subtitle: string
  year: number
  photos: StoryPhoto[]
  time_segments: TimeSegments
  total_count: number
}

export interface CrossYearStory {
  type: 'cross_year'
  title: string
  subtitle: string
  years: number[]
  photos: StoryPhoto[]
  total_count: number
}

export interface StoryToday {
  date_label: string
  cross_year: CrossYearStory | null
  full_day: FullDayStory | null
}

export interface Theme {
  theme_id: string
  label: string
  type: 'city' | 'grid'
  photo_count: number
  year_range: [number, number]
  cover_photo_id: string | null
  sample_photo_ids: string[]
}

export interface StoryThemes {
  themes: Theme[]
  total_themes: number
  photos_with_gps: number
  photos_without_gps: number
}

export interface ThemeDetail {
  theme_id: string
  label: string
  photos_by_year: Record<string, StoryPhoto[]>
  total_count: number
}
