//! Shape of the settings context value.
//!
//! Split from `SettingsContext.tsx` so the provider file holds behaviour only.

import type { Accessor, Setter } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'

import type { CheckResult } from '../../services/updater'
import type { Config, DataSource, PriceLine, WatchItem } from '../../types'
import type { TabKey } from './settingsMeta'

export interface SettingsContextValue {
  form: Config
  setForm: SetStoreFunction<Config>
  sources: Accessor<Array<[DataSource, string]>>
  ready: Accessor<boolean>
  hasIwenCaiKey: Accessor<boolean>
  activeTab: Accessor<TabKey>
  setActiveTab: Setter<TabKey>
  msg: Accessor<{ text: string; kind: '' | 'ok' | 'bad' }>
  say: (text: string, kind?: '' | 'ok' | 'bad') => void

  currentAppVersion: Accessor<string>
  updateResult: Accessor<CheckResult | null>
  setUpdateResult: Setter<CheckResult | null>
  isCheckingUpdate: Accessor<boolean>
  isUpdateModalOpen: Accessor<boolean>
  setIsUpdateModalOpen: Setter<boolean>
  updateCheckMsg: Accessor<string>

  handleManualCheckUpdate: () => Promise<void>
  handleOpenReleasePage: () => Promise<void>
  save: () => Promise<void>
  sizesText: () => string

  updateItem: (i: number, patch: Partial<WatchItem>) => void
  addItem: () => void
  addItemWith: (item: WatchItem) => void
  removeItem: (i: number) => void
  moveItem: (from: number, to: number) => void
  sortItems: (criterion: 'code-asc' | 'code-desc' | 'name' | 'holding' | 'reverse') => void
  addLine: (i: number) => void
  updateLine: (i: number, li: number, patch: Partial<PriceLine>) => void
  removeLine: (i: number, li: number) => void
  createGroup: (name: string) => Promise<import('../../types').WatchGroup>
  renameGroup: (id: string, name: string) => Promise<void>
  deleteGroup: (id: string, moveToDefault: boolean) => Promise<void>
}
