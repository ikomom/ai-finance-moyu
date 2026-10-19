import { createMemo } from 'solid-js'
import { renderMarkdown } from '../../utils/markdown'

export interface FinancialCardProps {
  content: string
}

export function FinancialCard(props: FinancialCardProps) {
  // `renderMarkdown` sanitizes with DOMPurify: the content is LLM output, which
  // is untrusted by construction (prompt injection via tool results / news).
  const renderedHtml = createMemo(() => renderMarkdown(props.content))

  return <div class="agent-financial-card markdown-body" innerHTML={renderedHtml()} />
}
