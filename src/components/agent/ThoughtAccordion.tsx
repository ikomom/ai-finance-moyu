import { createSignal, createEffect, Show } from 'solid-js'

export interface ThoughtAccordionProps {
  thought: string
  isStreaming?: boolean
}

export function ThoughtAccordion(props: ThoughtAccordionProps) {
  const [expanded, setExpanded] = createSignal(props.isStreaming ?? false)

  // 正在输出思考过程时默认自动展开，思考完成后自动折叠
  createEffect(() => {
    if (props.isStreaming && !expanded()) {
      setExpanded(true)
    }
  })

  return (
    <Show when={props.thought.trim().length > 0}>
      <div class="agent-thought-accordion">
        <button
          type="button"
          class="agent-thought-header"
          onClick={() => setExpanded(!expanded())}
        >
          <span class="agent-thought-title">
            <span class="agent-thought-icon">🧠</span>
            <span class="agent-thought-label">
              {props.isStreaming ? '正在盘口推演与风险核查...' : '深度推演过程'}
            </span>
            <Show when={props.isStreaming}>
              <span class="agent-thought-pulse" />
            </Show>
          </span>
          <span class="agent-thought-chevron">{expanded() ? '▲' : '▼'}</span>
        </button>

        <Show when={expanded()}>
          <div class="agent-thought-body">
            <pre class="agent-thought-text">{props.thought.trim()}</pre>
          </div>
        </Show>
      </div>
    </Show>
  )
}
