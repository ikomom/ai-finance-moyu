//! Types for storage and cache management.

export interface StorageStats {
  dataDir: string
  isCustomDir: boolean
  totalSizeBytes: number
  historyTrendSizeBytes: number
  historyTrendDayCount: number
  klineCacheSizeBytes: number
  baselineCacheSizeBytes: number
  logsSizeBytes: number
  aiModelsSizeBytes: number
}

export interface MigrateResult {
  success: boolean
  fileCount: number
  totalBytes: number
  newDir: string
}
