// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { renderMarkdown } from './markdown'

/**
 * The two `innerHTML` sinks (AI review card + update changelog) both render
 * untrusted text. These tests pin the sanitizer in place: if DOMPurify is ever
 * dropped from `renderMarkdown`, they fail.
 */
describe('renderMarkdown sanitisation', () => {
  it('renders ordinary markdown', () => {
    const html = renderMarkdown('# 标题\n\n**加粗**')
    expect(html).toContain('<h1>')
    expect(html).toContain('<strong>')
  })

  it('strips inline event handlers', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">')
    expect(html).not.toContain('onerror')
    expect(html.toLowerCase()).not.toContain('alert(1)')
  })

  it('strips script tags and their body', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html.toLowerCase()).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('drops javascript: links', () => {
    const html = renderMarkdown('[点我](javascript:alert(1))')
    expect(html.toLowerCase()).not.toContain('javascript:')
  })

  it('removes iframes and inline styles', () => {
    const html = renderMarkdown('<iframe src="https://evil"></iframe><p style="x">y</p>')
    expect(html.toLowerCase()).not.toContain('<iframe')
    expect(html).not.toContain('style=')
  })

  it('keeps the formatting a changelog actually needs', () => {
    const html = renderMarkdown('- 修复了一个问题\n- 新增了另一个功能')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
  })

  it('never throws on malformed input', () => {
    expect(() => renderMarkdown('```未闭合的代码块')).not.toThrow()
    expect(() => renderMarkdown('')).not.toThrow()
  })
})
