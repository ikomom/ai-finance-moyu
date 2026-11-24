//! Data source channels and external financial API key configuration card.
//!
//! Complies with AGENTS.md §2 (fallback cascade), §11 (isolated module, <=300 lines),
//! and §15 (theme-adaptive colors).

import { createSignal, For, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { SOURCE_NOTES, useSettings } from './SettingsContext'

export function DataSourceCard() {
  const { form, setForm, sources, hasIwenCaiKey } = useSettings()
  const [isCleared, setIsCleared] = createSignal(false)
  const [inputValue, setInputValue] = createSignal('')

  const hasStoredKey = () => hasIwenCaiKey() && !isCleared()

  const handleInput = (val: string) => {
    setInputValue(val)
    setForm('iwencaiApiKey', val)
    if (val.trim()) {
      setIsCleared(false)
    }
  }

  const handleClear = () => {
    setInputValue('')
    setForm('iwencaiApiKey', '')
    setIsCleared(true)
  }

  const handleOpenConsole = async (e: MouseEvent) => {
    e.preventDefault()
    const url = 'https://fuyao.aicubes.cn/admin'
    try {
      await invoke('open_url', { url })
    } catch {
      window.open(url, '_blank')
    }
  }

  return (
    <div class="card">
      <div class="card-title-row">
        <h2>
          <span class="title-icon">🌐</span>
          <span>数据源通道与 API 配置</span>
        </h2>
        <span class="card-badge">行情与全景</span>
      </div>

      {/* 1. 公开行情通道 */}
      <div style="margin-bottom: 14px;">
        <p class="hint" style="margin-top: 0; margin-bottom: 8px;">
          公开行情通道免登录，切换源后立即重连重新拉取。
        </p>
        <div class="source-pills">
          <For each={sources()}>
            {([value, label]) => (
              <div
                class="source-pill"
                classList={{ active: form.dataSource === value }}
                onClick={() => setForm('dataSource', value)}
              >
                <div class="pill-radio-dot" />
                <div class="pill-content">
                  <span class="pill-title">{label}</span>
                  <span class="pill-desc">{SOURCE_NOTES[value] ?? ''}</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* 2. 同花顺金融数据 API Key */}
      <div class="api-key-section">
        <div class="api-key-header">
          <div class="api-key-title-group">
            <span class="api-key-title">同花顺金融数据 API Key</span>
            <span class="api-key-tag">金融数据 / 问财</span>
          </div>
          <Show
            when={hasStoredKey()}
            fallback={
              <span class="api-key-status unconfigured">未配置（本地精品题材库保底）</span>
            }
          >
            <span class="api-key-status configured">✓ 已配置 API Key</span>
          </Show>
        </div>
        <p class="hint" style="margin-top: 4px; margin-bottom: 8px;">
          配置后优先通过同花顺金融数据 API / 问财拉取题材概念、资金排位与异动归因；未配置时无缝启用本地精品题材库与腾讯板块高频联动保底。
        </p>

        <div class="api-key-input-row">
          <input
            type="password"
            class="api-key-input"
            value={inputValue()}
            placeholder={
              hasStoredKey()
                ? '已安全保存（留空保持不变）'
                : '输入同花顺 API Key (如 sk-fuyao-... 或问财 Token)'
            }
            onInput={(e) => handleInput(e.currentTarget.value)}
          />
          <Show when={hasStoredKey()}>
            <button
              type="button"
              class="btn-sm btn-ghost btn-danger-ghost"
              title="清除已保存的 API Key"
              onClick={handleClear}
            >
              清空 Key
            </button>
          </Show>
        </div>

        <div class="api-key-help-row">
          <span class="api-key-help-text">
            支持 <code>FUYAO_API_KEY</code> / <code>IWENCAI_API_KEY</code> 环境变量。获取 Key：
            <a
              href="https://fuyao.aicubes.cn/admin"
              class="api-key-link"
              onClick={handleOpenConsole}
            >
              同花顺金融数据平台 ↗
            </a>
          </span>
        </div>
      </div>
    </div>
  )
}
