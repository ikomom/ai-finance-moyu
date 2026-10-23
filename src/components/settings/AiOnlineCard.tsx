//! Online Model API configuration card.
//!
//! Subcomponent extracted from AiDecisionTab to observe AGENTS.md §11 (<300 lines).

import type { Accessor, Setter } from 'solid-js'

export interface AiOnlineCardProps {
  onlineEndpoint: Accessor<string>
  setOnlineEndpoint: Setter<string>
  onlineApiKey: Accessor<string>
  setOnlineApiKey: Setter<string>
  onlineModel: Accessor<string>
  setOnlineModel: Setter<string>
  onSave: () => Promise<void>
}

export function AiOnlineCard(props: AiOnlineCardProps) {
  return (
    <div class="card">
      <div class="card-title-row">
        <h2>
          <span class="title-icon">☁️</span>
          <span>线上 API 决策服务配置</span>
        </h2>
        <span class="card-badge">兼容 OpenAI 规范</span>
      </div>

      <div class="field">
        <label>API 请求端点 (Endpoint)</label>
        <input
          type="text"
          value={props.onlineEndpoint()}
          onInput={(e) => props.setOnlineEndpoint(e.currentTarget.value)}
          placeholder="https://openrouter.ai/api/alpha/decisions"
        />
      </div>

      <div class="ai-grid-fields" style={{ 'margin-top': '8px' }}>
        <div class="field">
          <label>API Key (留空保持原值)</label>
          <input
            type="password"
            value={props.onlineApiKey()}
            onInput={(e) => props.setOnlineApiKey(e.currentTarget.value)}
            placeholder="sk-or-v1-..."
          />
        </div>
        <div class="field">
          <label>线上模型名称</label>
          <input
            type="text"
            value={props.onlineModel()}
            onInput={(e) => props.setOnlineModel(e.currentTarget.value)}
            placeholder="typesafe/jev-1.13"
          />
        </div>
      </div>

      <div class="ai-btn-group">
        <button
          type="button"
          class="btn-primary"
          onClick={() => void props.onSave()}
        >
          保存并应用线上配置
        </button>
      </div>
    </div>
  )
}
