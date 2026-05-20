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

export interface StagingFile {
  photo_id: string
  file_name: string
  file_size_bytes: number
  left_at: string
}

export interface StagingInfo {
  staging_path: string
  files: StagingFile[]
  total_count: number
  total_size_bytes: number
}

export type AppView = 'strata' | 'site' | 'decision'
