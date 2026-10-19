import { For } from 'solid-js'

export interface CapsuleBarProps {
  onSelect: (prompt: string) => void
  disabled?: boolean
}

interface CapsuleItem {
  icon: string
  label: string
  prompt: string
}

const CAPSULES: CapsuleItem[] = [
  {
    icon: '📊',
    label: '多空诊断',
    prompt: '请对当前标的做一次全面的多空定调与微观盘口推演。',
  },
  {
    icon: '🛡️',
    label: '关键点位',
    prompt: '请基于确定性量化工具测算日内 VWAP、支撑位与阻力位，核对持仓止损纪律。',
  },
  {
    icon: '⚡',
    label: '异动归因',
    prompt: '核查当前标的是否存在大单扫盘、急涨急跌或集合竞价异常异动？',
  },
  {
    icon: '📝',
    label: '盘后复盘',
    prompt: '结合全市场成交量与大盘多空环境，对当前持仓标的进行日内战术复盘。',
  },
  {
    icon: '🌐',
    label: '联网动态',
    prompt: '联网检索该标的近期最新互动易、重大公告及所属板块突发消息。',
  },
]

export function CapsuleBar(props: CapsuleBarProps) {
  return (
    <div class="agent-capsule-bar">
      <For each={CAPSULES}>
        {(item) => (
          <button
            type="button"
            class="agent-capsule-btn"
            disabled={props.disabled}
            onClick={() => props.onSelect(item.prompt)}
          >
            <span class="agent-capsule-icon">{item.icon}</span>
            <span class="agent-capsule-label">{item.label}</span>
          </button>
        )}
      </For>
    </div>
  )
}
