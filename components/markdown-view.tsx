'use client'

import React, { useMemo } from 'react'

interface Props {
  content: string
}

/**
 * Renderer hibrida Markdown & HTML (Word-like rich text).
 *
 * Mendukung sintaks Markdown standar (##, **, lists, tables) sekaligus tag HTML
 * seperti di Microsoft Word atau Google Docs (<b>, <strong>, <i>, <em>, <u>,
 * <mark>, <p>, <table>, <span>, <ul>, <ol>, <blockquote>, dll).
 */
export function MarkdownView({ content }: Props) {
  const renderedHtml = useMemo(() => {
    return processMarkdownAndHtml(content)
  }, [content])

  return (
    <div
      className="article-body-content"
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  )
}

/**
 * Memproses teks menjadi HTML aman dengan dukungan Markdown dan HTML.
 */
function processMarkdownAndHtml(raw: string): string {
  if (!raw) return ''

  // 1. Sanitasi awal untuk mencegah script berbahaya
  let text = raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript\s*:/gi, '')

  // 2. Normalisasi Markdown Tables menjadi HTML <table>
  text = processMarkdownTables(text)

  // 3. Normalisasi Blockquotes
  text = text.replace(/^>\s+(.+)$/gm, '<blockquote><p>$1</p></blockquote>')

  // 4. Normalisasi Headings (h2, h3, h4)
  text = text.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  text = text.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  text = text.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // 5. Normalisasi Horizontal Rule
  text = text.replace(/^(\-\-\-|\*\*\*)$/gm, '<hr />')

  // 6. Normalisasi Lists
  text = text.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
  text = text.replace(/(<li>.*<\/li>\s*)+/g, '<ul>$&</ul>')

  // 7. Normalisasi Inline Markdown: Bold, Italic, Code
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 8. Normalisasi Paragraf jika belum terbungkus blok HTML
  const blocks = text.split(/\n\s*\n/)
  const wrapped = blocks
    .map((block) => {
      const trimmed = block.trim()
      if (!trimmed) return ''
      // Jika sudah diawali tag block HTML, biarkan
      if (
        /^(<(h[1-6]|table|thead|tbody|tr|th|td|ul|ol|li|blockquote|div|p|hr|figure|pre)\b)/i.test(
          trimmed,
        )
      ) {
        return trimmed
      }
      return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`
    })
    .filter(Boolean)
    .join('\n')

  return wrapped
}

/**
 * Mengubah tabel Markdown | a | b | menjadi tag <table> HTML bersih.
 */
function processMarkdownTables(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let inTable = false
  let tableRows: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith('|') && line.endsWith('|')) {
      inTable = true
      tableRows.push(line)
    } else {
      if (inTable) {
        out.push(renderHtmlTable(tableRows))
        tableRows = []
        inTable = false
      }
      out.push(lines[i])
    }
  }

  if (inTable && tableRows.length > 0) {
    out.push(renderHtmlTable(tableRows))
  }

  return out.join('\n')
}

function renderHtmlTable(rows: string[]): string {
  if (rows.length < 2) return rows.join('\n')

  const headerCols = rows[0]
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim())
  const bodyRows = rows.slice(2) // Baris ke-1 biasanya pemisah |---|---|

  let html = '<table><thead><tr>'
  for (const h of headerCols) {
    html += `<th>${h}</th>`
  }
  html += '</tr></thead><tbody>'

  for (const row of bodyRows) {
    const cols = row
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    html += '<tr>'
    for (const c of cols) {
      html += `<td>${c}</td>`
    }
    html += '</tr>'
  }

  html += '</tbody></table>'
  return html
}
