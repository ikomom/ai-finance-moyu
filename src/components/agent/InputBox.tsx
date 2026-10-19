import { createSignal, Show } from 'solid-js'

export interface InputBoxProps {
  onSend: (text: string) => void
  isStreaming?: boolean
  onStop?: () => void
  placeholder?: string
}

export function InputBox(props: InputBoxProps) {
  const [text, setText] = createSignal('')
  let textareaRef: HTMLTextAreaElement | undefined

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const submit = () => {
    const val = text().trim()
    if (!val || props.isStreaming) return
    props.onSend(val)
    setText('')
    if (textareaRef) {
      textareaRef.style.height = 'auto'
    }
  }

  const handleInput = (e: InputEvent) => {
    const target = e.currentTarget as HTMLTextAreaElement
    setText(target.value)
    target.style.height = 'auto'
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`
  }

  return (
    <div class="agent-input-container">
      <textarea
        ref={textareaRef}
        rows={1}
        class="agent-input-field"
        placeholder={props.placeholder ?? '向智投副驾驶提问或探讨盘面纪律 (Enter 发送)...'}
        value={text()}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        disabled={props.isStreaming}
      />

      <div class="agent-input-actions">
        <Show
          when={!props.isStreaming}
          fallback={
            <button
              type="button"
              class="agent-btn-stop"
              title="停止生成"
              onClick={props.onStop}
            >
              ⏹ 停止
            </button>
          }
        >
          <button
            type="button"
            class="agent-btn-send"
            disabled={!text().trim()}
            onClick={submit}
            title="发送 (Enter)"
          >
            发送
          </button>
        </Show>
      </div>
    </div>
  )
}
