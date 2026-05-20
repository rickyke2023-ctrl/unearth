export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function formatMonth(month: number): string {
  return `${month}月`
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function strataColorForYear(year: number): string {
  const map: Record<number, string> = {
    2024: 'var(--strata-2024)',
    2023: 'var(--strata-2023)',
    2022: 'var(--strata-2022)',
    2021: 'var(--strata-2021)',
    2020: 'var(--strata-2020)',
  }
  return map[year] ?? '#888'
}

export function progress(decided: number, total: number): number {
  if (total === 0) return 0
  return Math.round((decided / total) * 100)
}
