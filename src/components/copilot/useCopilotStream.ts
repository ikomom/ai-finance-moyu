import type { Setter } from 'solid-js'
import type { AgentMessage } from '../../types/agent'
import { listenToAgentStream } from '../../services/agent'

/**
 * Bridge the backend's token stream into the message list.
 *
 * Events are emitted on the *window*, not on a session, so a stream that is
 * still running while the user switches conversations used to append its deltas
 * to whatever conversation happened to be open. `isActive` lets the caller say
 * "this stream no longer belongs to the visible session"; when it returns false
 * the deltas are dropped instead of corrupting another transcript.
 */
export async function attachCopilotStream(
  setMessages: Setter<AgentMessage[]>,
  setIsStreaming: Setter<boolean>,
  onDonePersist: () => Promise<void>,
  isActive: () => boolean = () => true
) {
  const appendToLastAssistant = (apply: (last: AgentMessage) => AgentMessage) => {
    if (!isActive()) return
    setMessages((prev) => {
      if (prev.length === 0) return prev
      const lastIdx = prev.length - 1
      const last = prev[lastIdx]
      if (last.role !== 'assistant') return prev
      return [...prev.slice(0, lastIdx), apply(last)]
    })
  }

  return await listenToAgentStream({
    onChunk: (delta) => {
      appendToLastAssistant((last) => ({ ...last, content: last.content + delta }))
    },
    onThought: (thoughtDelta) => {
      appendToLastAssistant((last) => ({
        ...last,
        thought: (last.thought || '') + thoughtDelta,
      }))
    },
    onDone: async (finalContent, finalThought) => {
      if (!isActive()) return
      appendToLastAssistant((last) => ({
        ...last,
        content: finalContent || last.content,
        thought: finalThought || last.thought,
        isStreaming: false,
      }))
      setIsStreaming(false)
      await onDonePersist()
    },
    onError: (err) => {
      appendToLastAssistant((last) => ({
        ...last,
        content: last.content + `\n\n> ⚠️ **推演中断**: ${err}`,
        isStreaming: false,
      }))
      if (isActive()) setIsStreaming(false)
    },
  })
}
