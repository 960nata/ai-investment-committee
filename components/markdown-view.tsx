'use client'

import React from 'react'

interface Props {
  content: string
}

/**
 * Renderer Markdown ringan tanpa pustaka eksternal.
 * Menangani heading, paragraf, list, blockquote, tabel, dan penekanan tebal.
 */
export function MarkdownView({ content }: Props) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Baris kosong
    if (!trimmed) {
      i++
      continue
    }

    // Horizontal Rule
    if (trimmed === '---' || trimmed === '***') {
      elements.push(<hr key={i} className="my-6 border-t border-[var(--line)]" />)
      i++
      continue
    }

    // Heading 2
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-xl font-bold text-[var(--ink)] mt-8 mb-3 flex items-center gap-2">
          {formatInline(trimmed.slice(3))}
        </h2>,
      )
      i++
      continue
    }

    // Heading 3
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-lg font-semibold text-[var(--ink)] mt-6 mb-2">
          {formatInline(trimmed.slice(4))}
        </h3>,
      )
      i++
      continue
    }

    // Heading 4
    if (trimmed.startsWith('#### ')) {
      elements.push(
        <h4 key={i} className="text-base font-semibold text-[var(--ink-mute)] mt-4 mb-2">
          {formatInline(trimmed.slice(5))}
        </h4>,
      )
      i++
      continue
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().slice(2))
        i++
      }
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="my-4 pl-4 py-2 border-l-2 border-[var(--brand)] bg-[var(--tint-brand)] text-[var(--ink)] rounded-r italic"
        >
          {quoteLines.map((ql, qidx) => (
            <p key={qidx} className="mb-1 last:mb-0">
              {formatInline(ql)}
            </p>
          ))}
        </blockquote>,
      )
      continue
    }

    // Table
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim())
        i++
      }

      if (tableLines.length >= 2) {
        const headerCols = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim())
        // Baris kedua adalah pemisah (---)
        const rowLines = tableLines.slice(2)

        elements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-5">
            <table className="w-full text-sm border-collapse text-left border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--bg-card)] border-b border-[var(--line)]">
                  {headerCols.map((h, hidx) => (
                    <th key={hidx} className="px-3 py-2 font-semibold text-[var(--ink-mute)]">
                      {formatInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowLines.map((r, ridx) => {
                  const cols = r
                    .split('|')
                    .slice(1, -1)
                    .map((c) => c.trim())
                  return (
                    <tr
                      key={ridx}
                      className="border-b border-[var(--line)] hover:bg-[var(--bg-subtle)]"
                    >
                      {cols.map((col, cidx) => (
                        <td key={cidx} className="px-3 py-2 text-[var(--ink)]">
                          {formatInline(col)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>,
        )
        continue
      }
    }

    // Unordered List
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const listItems: string[] = []
      while (
        i < lines.length &&
        (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))
      ) {
        listItems.push(lines[i].trim().slice(2))
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside my-3 space-y-1 text-[var(--ink)]">
          {listItems.map((item, lidx) => (
            <li key={lidx} className="leading-relaxed">
              {formatInline(item)}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    // Ordered List (1. , 2. )
    if (/^\d+\.\s/.test(trimmed)) {
      const listItems: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside my-3 space-y-1.5 text-[var(--ink)]">
          {listItems.map((item, lidx) => (
            <li key={lidx} className="leading-relaxed">
              {formatInline(item)}
            </li>
          ))}
        </ol>,
      )
      continue
    }

    // Paragraph biasa
    elements.push(
      <p key={i} className="my-3 leading-relaxed text-[var(--ink)]">
        {formatInline(trimmed)}
      </p>,
    )
    i++
  }

  return <div className="article-body-content">{elements}</div>
}

/**
 * Format penekanan inline: **bold**, *italic*, dan `code`
 */
function formatInline(text: string): React.ReactNode {
  // Regex untuk memisahkan token bold, italic, dan code
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)

  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={idx} className="font-bold text-[var(--ink)]">
          {token.slice(2, -2)}
        </strong>
      )
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return (
        <em key={idx} className="italic">
          {token.slice(1, -1)}
        </em>
      )
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded text-xs font-mono bg-[var(--bg-subtle)] text-[var(--brand)] border border-[var(--line)]"
        >
          {token.slice(1, -1)}
        </code>
      )
    }
    return token
  })
}
