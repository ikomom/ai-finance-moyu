// Markdown rendering shared by the AI review card and the update changelog.
//
// Both used to feed `marked` output straight into `innerHTML`. `marked` passes
// raw HTML through unchanged by design, so any `<img onerror=...>` arriving from
// an LLM reply or a GitHub release body executed inside a webview that (at the
// time) had no CSP and exposed `window.__TAURI__` — a straight path from text to
// arbitrary command execution. Everything rendered here is untrusted input.

import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

/** Allow-list tuned for changelog/analyst prose: no scripts, no handlers, no iframes. */
const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'input', 'iframe', 'object', 'embed', 'link', 'meta'],
  FORBID_ATTR: ['style', 'srcset'],
  ALLOW_DATA_ATTR: false,
}

/**
 * Render untrusted Markdown to sanitized HTML.
 *
 * Returns a plain-text fallback if parsing throws, so a malformed payload shows
 * as text rather than taking the render down with it.
 */
export function renderMarkdown(text: string): string {
  const source = text ?? ''
  let html: string
  try {
    html = marked.parse(source, { async: false, gfm: true, breaks: true }) as string
  } catch {
    html = escapeHtml(source)
  }
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
