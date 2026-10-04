import { useState, useRef, useCallback, useEffect } from 'react'
import { Trash2, Copy, Clipboard, LayoutGrid } from 'lucide-react'
import type { QuestionType, Question, Option } from '../../types/database'

type DraftOption = Omit<Option, 'id' | 'question_id'> & { tempId: string }
type DraftQuestion = Omit<Question, 'id' | 'quiz_id'> & { tempId: string; options: DraftOption[] }

interface Props {
  questions: DraftQuestion[]
  onChange: (questions: DraftQuestion[]) => void
  onSwitchToCardMode?: () => void
}

const TOTAL_ROWS = 200
const EDIT_COLS = 8 // type(0), question(1), a1(2), a2(3), a3(4), a4(5), time(6), points(7)

const TIME_OPTIONS = [
  { label: 'Geen', value: 0 },
  { label: '10s', value: 10 },
  { label: '20s', value: 20 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: '120s', value: 120 },
]
const POINTS_OPTIONS = [
  { label: 'Uit', value: 0 },
  { label: '250', value: 250 },
  { label: '500', value: 500 },
  { label: '750', value: 750 },
  { label: '1000', value: 1000 },
  { label: '1500', value: 1500 },
  { label: '2000', value: 2000 },
]

interface Row {
  tempId: string
  type: QuestionType
  question: string
  imageUrl: string | null
  a1: string; a2: string; a3: string; a4: string
  time: number
  points: number
}
interface Sel { r1: number; c1: number; r2: number; c2: number }

function emptyRow(): Row {
  return { tempId: crypto.randomUUID(), type: 'multiple_choice', question: '', imageUrl: null, a1: '', a2: '', a3: '', a4: '', time: 60, points: 1000 }
}
function isRowEmpty(r: Row) { return !r.question.trim() && !r.a1.trim() && !r.a2.trim() && !r.a3.trim() && !r.a4.trim() }

function qToRow(q: DraftQuestion): Row {
  let a1 = '', a2 = '', a3 = '', a4 = ''
  if (q.question_type === 'drag_order') {
    const s = [...q.options].sort((a, b) => (a.correct_order ?? 0) - (b.correct_order ?? 0))
    ;[a1, a2, a3, a4] = s.slice(0, 4).map(o => o.option_text ?? '')
  } else if (q.question_type === 'select_image') {
    const c = q.options.find(o => o.is_correct); const w = q.options.filter(o => !o.is_correct)
    a1 = c?.image_url ?? ''; [a2, a3, a4] = w.slice(0, 3).map(o => o.image_url ?? '')
  } else {
    const c = q.options.find(o => o.is_correct); const w = q.options.filter(o => !o.is_correct)
    a1 = c?.option_text ?? ''; [a2, a3, a4] = w.slice(0, 3).map(o => o.option_text ?? '')
  }
  return { tempId: q.tempId, type: q.question_type, question: q.question_text, imageUrl: q.image_url, a1, a2, a3, a4, time: q.time_limit, points: q.points_enabled ? (q.points_value ?? 1000) : 0 }
}

function rowToQ(row: Row, idx: number): DraftQuestion {
  if (row.type === 'brainstorm') {
    return { tempId: row.tempId, question_type: 'brainstorm', question_text: row.question, image_url: row.imageUrl, time_limit: 0, points_enabled: false, points_value: 1000, zone_polygon: null, order_index: idx, options: [] }
  }
  if (row.type === 'pin') {
    return { tempId: row.tempId, question_type: 'pin', question_text: row.question, image_url: row.imageUrl, time_limit: row.time, points_enabled: row.points > 0, points_value: row.points > 0 ? row.points : 1000, zone_polygon: null, order_index: idx, options: [] }
  }
  const vals = [row.a1, row.a2, row.a3, row.a4]
  let options: DraftOption[]
  if (row.type === 'drag_order') {
    options = vals.map((v, i) => ({ tempId: crypto.randomUUID(), option_text: v.trim() || null, image_url: null, is_correct: false, correct_order: i })).filter(o => o.option_text)
  } else if (row.type === 'select_image') {
    options = vals.filter(v => v.trim()).map((v, i) => ({ tempId: crypto.randomUUID(), option_text: null, image_url: v, is_correct: i === 0, correct_order: null }))
  } else {
    options = vals.filter(v => v.trim()).map((v, i) => ({ tempId: crypto.randomUUID(), option_text: v, image_url: null, is_correct: i === 0, correct_order: null }))
  }
  while (options.length < 2) options.push({ tempId: crypto.randomUUID(), option_text: '', image_url: null, is_correct: false, correct_order: row.type === 'drag_order' ? options.length : null })
  return { tempId: row.tempId, question_type: row.type, question_text: row.question, image_url: row.imageUrl, time_limit: row.time, points_enabled: row.points > 0, points_value: row.points > 0 ? row.points : 1000, zone_polygon: null, order_index: idx, options }
}

function getCellValue(row: Row, c: number): string {
  switch (c) {
    case 0: return row.type
    case 1: return row.question
    case 2: return row.a1
    case 3: return row.a2
    case 4: return row.a3
    case 5: return row.a4
    case 6: return String(row.time)
    case 7: return String(row.points)
    default: return ''
  }
}

function setCellValue(row: Row, c: number, v: string): Row {
  const r = { ...row }
  switch (c) {
    case 0: if (['multiple_choice', 'drag_order', 'select_image'].includes(v)) r.type = v as QuestionType; break
    case 1: r.question = v; break
    case 2: r.a1 = v; break
    case 3: r.a2 = v; break
    case 4: r.a3 = v; break
    case 5: r.a4 = v; break
    case 6: { const n = Number(v); if (!isNaN(n)) r.time = n; break }
    case 7: { const n = Number(v); if (!isNaN(n)) r.points = n; break }
  }
  return r
}

function inSel(r: number, c: number, sel: Sel | null) {
  if (!sel) return false
  return r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2
}

export function SpreadsheetEditor({ questions, onChange, onSwitchToCardMode }: Props) {
  const [rows, setRows] = useState<Row[]>(() => {
    const init = questions.map(qToRow)
    while (init.length < TOTAL_ROWS) init.push(emptyRow())
    return init
  })
  const [sel, setSel] = useState<Sel | null>(null)
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null)
  const [cardModeHint, setCardModeHint] = useState<null | 'brainstorm' | 'pin'>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  function sync(updated: Row[]) {
    onChange(updated.filter(r => !isRowEmpty(r)).map((r, i) => rowToQ(r, i)))
  }

  function updateRow(ri: number, patch: Partial<Row>) {
    if (patch.type === 'brainstorm' || patch.type === 'pin') {
      setCardModeHint(patch.type)
    }
    const updated = rows.map((r, i) => i === ri ? { ...r, ...patch } : r)
    setRows(updated); sync(updated)
  }

  function duplicateRow(ri: number) {
    const copy = { ...rows[ri], tempId: crypto.randomUUID() }
    const next = [...rows]; next.splice(ri + 1, 0, copy); next.pop()
    setRows(next); sync(next)
    setTimeout(() => focusCell(ri + 1, 1), 50)
  }

  function deleteRow(ri: number) {
    const next = [...rows]; next.splice(ri, 1); next.push(emptyRow())
    setRows(next); sync(next)
  }

  function focusCell(ri: number, ci: number) {
    const el = tableRef.current?.querySelector(`[data-row="${ri}"][data-col="${ci}"]`) as HTMLElement | null
    el?.focus()
  }

  // --- Selection helpers ---
  function selectCell(r: number, c: number) {
    setSel({ r1: r, c1: c, r2: r, c2: c })
    setAnchor({ r, c })
  }

  function extendSel(r: number, c: number) {
    if (!anchor) { selectCell(r, c); return }
    setSel({ r1: Math.min(anchor.r, r), c1: Math.min(anchor.c, c), r2: Math.max(anchor.r, r), c2: Math.max(anchor.c, c) })
  }

  // Copy selected range to clipboard as TSV
  const copySelection = useCallback(() => {
    if (!sel) return
    const lines: string[] = []
    for (let r = sel.r1; r <= sel.r2; r++) {
      const cols: string[] = []
      for (let c = sel.c1; c <= sel.c2; c++) cols.push(getCellValue(rows[r], c))
      lines.push(cols.join('\t'))
    }
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
  }, [sel, rows])

  // Paste TSV into table starting at (ri, ci)
  function pasteAt(text: string, ri: number, ci: number) {
    const pastedRows = text.trimEnd().split(/\r?\n/)
    const next = rows.map(r => ({ ...r }))
    pastedRows.forEach((line, rowOff) => {
      const tr = ri + rowOff
      if (tr >= TOTAL_ROWS) return
      line.split('\t').forEach((val, colOff) => {
        const tc = ci + colOff
        if (tc >= EDIT_COLS) return
        next[tr] = setCellValue(next[tr], tc, val.trim())
      })
    })
    setRows(next); sync(next)
    // Highlight pasted range
    const endR = Math.min(TOTAL_ROWS - 1, ri + pastedRows.length - 1)
    const endC = Math.min(EDIT_COLS - 1, ci + (pastedRows[0]?.split('\t').length ?? 1) - 1)
    setSel({ r1: ri, c1: ci, r2: endR, c2: endC })
    setAnchor({ r: ri, c: ci })
  }

  // Handle TD mousedown for range selection
  function handleTdMouseDown(e: React.MouseEvent, ri: number, ci: number) {
    if (e.shiftKey) {
      e.preventDefault() // don't focus the input
      extendSel(ri, ci)
    } else {
      selectCell(ri, ci)
      // let click propagate so input gets focused
    }
  }

  // Key handling for inputs inside cells
  function handleKeyDown(e: React.KeyboardEvent, ri: number, ci: number, isSelect = false) {
    // Copy multi-cell selection
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      if (sel && (sel.r1 !== sel.r2 || sel.c1 !== sel.c2)) {
        e.preventDefault()
        copySelection()
      }
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault(); duplicateRow(ri); return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const nextR = e.shiftKey ? (ci > 0 ? ri : ri - 1) : (ci < EDIT_COLS - 1 ? ri : ri + 1)
      const nextC = e.shiftKey ? (ci > 0 ? ci - 1 : EDIT_COLS - 1) : (ci < EDIT_COLS - 1 ? ci + 1 : 0)
      if (nextR >= 0 && nextR < TOTAL_ROWS) { selectCell(nextR, nextC); focusCell(nextR, nextC) }
    } else if (e.key === 'Enter' && !isSelect) {
      e.preventDefault()
      if (ri < TOTAL_ROWS - 1) { selectCell(ri + 1, ci); focusCell(ri + 1, ci) }
    }
  }

  // Paste from clipboard (onPaste on inputs)
  function handlePaste(e: React.ClipboardEvent, ri: number, ci: number) {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return // single cell — let browser handle
    e.preventDefault()
    pasteAt(text, ri, ci)
  }

  // Global keyboard listener for copy when table has focus but no specific input captured it
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const inTable = tableRef.current?.contains(document.activeElement)
        if (inTable && sel && (sel.r1 !== sel.r2 || sel.c1 !== sel.c2)) {
          e.preventDefault()
          copySelection()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [copySelection])

  function goToFirstEmpty() {
    const i = rows.findIndex(r => isRowEmpty(r))
    if (i >= 0) { selectCell(i, 1); focusCell(i, 1) }
  }

  // Cell class helpers
  const inputBase = "w-full px-2 py-1.5 text-sm bg-transparent outline-none border-0"

  function tdClass(ri: number, ci: number, extra = '') {
    const selected = inSel(ri, ci, sel)
    const isAnchor = anchor && anchor.r === ri && anchor.c === ci
    const base = 'border-l border-gray-100 p-0 relative'
    if (isAnchor && sel && (sel.r1 !== sel.r2 || sel.c1 !== sel.c2)) return `${base} bg-blue-50 ring-2 ring-inset ring-blue-500 ${extra}`
    if (selected) return `${base} bg-blue-50 ${extra}`
    return `${base} ${extra}`
  }

  return (
    <div className="flex flex-col h-full bg-white select-none">
      {/* Card mode hint for brainstorm/pin */}
      {cardModeHint && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
          <span className="flex-1">
            <strong>{cardModeHint === 'brainstorm' ? 'Brainstorm' : 'Pin plaatsen'}</strong> vragen bewerk je best in kaartmodus
            {cardModeHint === 'pin' && ' (om de correcte zone te tekenen)'}.
          </span>
          {onSwitchToCardMode && (
            <button
              onClick={() => { setCardModeHint(null); onSwitchToCardMode() }}
              className="flex items-center gap-1.5 bg-amber-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-amber-700 transition cursor-pointer shrink-0"
            >
              <LayoutGrid size={12} /> Naar kaartmodus
            </button>
          )}
          <button onClick={() => setCardModeHint(null)} className="text-amber-400 hover:text-amber-700 cursor-pointer text-lg leading-none shrink-0">×</button>
        </div>
      )}
      {/* Selection info bar */}
      {sel && (sel.r1 !== sel.r2 || sel.c1 !== sel.c2) && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-blue-50 border-b border-blue-200 text-xs text-blue-700">
          <span>{(sel.r2 - sel.r1 + 1)} rijen × {(sel.c2 - sel.c1 + 1)} kolommen geselecteerd</span>
          <button
            onClick={copySelection}
            className="flex items-center gap-1 bg-blue-600 text-white px-2 py-0.5 rounded font-medium hover:bg-blue-700 transition cursor-pointer"
          >
            <Clipboard size={11} /> Kopieer selectie
          </button>
          <span className="text-blue-500">of druk Ctrl+C</span>
        </div>
      )}

      <div ref={tableRef} className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm min-w-max">
          <thead className="sticky top-0 z-10 bg-gray-50 border-b-2 border-gray-200">
            <tr>
              <th className="w-9 px-2 py-2.5 text-xs font-medium text-gray-400 text-center">#</th>
              <th className="w-32 px-2 py-2.5 text-xs font-medium text-gray-600 text-left">Type</th>
              <th className="min-w-56 px-2 py-2.5 text-xs font-medium text-gray-600 text-left">Vraag</th>
              <th className="w-40 px-2 py-2.5 text-xs font-medium text-green-700 text-left bg-green-50/80 border-x border-green-200">Antwoord 1 ✓</th>
              <th className="w-32 px-2 py-2.5 text-xs font-medium text-gray-500 text-left">Antwoord 2</th>
              <th className="w-32 px-2 py-2.5 text-xs font-medium text-gray-500 text-left">Antwoord 3</th>
              <th className="w-32 px-2 py-2.5 text-xs font-medium text-gray-500 text-left">Antwoord 4</th>
              <th className="w-20 px-2 py-2.5 text-xs font-medium text-gray-600 text-left">Tijd</th>
              <th className="w-20 px-2 py-2.5 text-xs font-medium text-gray-600 text-left">Punten</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const empty = isRowEmpty(row)
              return (
                <tr key={row.tempId} className={`border-b border-gray-100 group ${empty ? '' : 'hover:bg-gray-50/30'}`}>
                  {/* Row # */}
                  <td className="text-center text-xs font-mono select-none w-9 text-gray-400">{ri + 1}</td>

                  {/* Type */}
                  <td className={tdClass(ri, 0)} onMouseDown={e => handleTdMouseDown(e, ri, 0)}>
                    <select
                      data-row={ri} data-col={0}
                      value={row.type}
                      onChange={e => updateRow(ri, { type: e.target.value as QuestionType })}
                      onFocus={() => selectCell(ri, 0)}
                      onKeyDown={e => handleKeyDown(e, ri, 0, true)}
                      className={`${inputBase} text-gray-700`}
                    >
                      <option value="multiple_choice">Meerkeuze</option>
                      <option value="drag_order">Volgorde</option>
                      <option value="select_image">Afbeelding</option>
                      <option value="brainstorm">Brainstorm</option>
                      <option value="pin">Pin plaatsen</option>
                    </select>
                  </td>

                  {/* Question */}
                  <td className={tdClass(ri, 1)} onMouseDown={e => handleTdMouseDown(e, ri, 1)}>
                    <input
                      data-row={ri} data-col={1} type="text"
                      value={row.question}
                      onChange={e => updateRow(ri, { question: e.target.value })}
                      onFocus={() => selectCell(ri, 1)}
                      onKeyDown={e => handleKeyDown(e, ri, 1)}
                      onPaste={e => handlePaste(e, ri, 1)}
                      className={`${inputBase} text-gray-900`}
                    />
                  </td>

                  {/* A1 */}
                  <td
                    className={tdClass(ri, 2, inSel(ri, 2, sel) ? 'bg-blue-50' : 'bg-green-50/30')}
                    onMouseDown={e => handleTdMouseDown(e, ri, 2)}
                    style={{ borderLeft: '1px solid #bbf7d0', borderRight: '1px solid #bbf7d0' }}
                  >
                    <input
                      data-row={ri} data-col={2} type="text"
                      value={row.a1}
                      onChange={e => updateRow(ri, { a1: e.target.value })}
                      onFocus={() => selectCell(ri, 2)}
                      onKeyDown={e => handleKeyDown(e, ri, 2)}
                      onPaste={e => handlePaste(e, ri, 2)}
                      placeholder={row.type === 'select_image' ? 'URL afbeelding...' : row.type === 'drag_order' ? 'Eerste item...' : 'Juist antwoord...'}
                      className={`${inputBase} text-gray-900 placeholder-gray-300`}
                    />
                  </td>

                  {/* A2 */}
                  <td className={tdClass(ri, 3)} onMouseDown={e => handleTdMouseDown(e, ri, 3)}>
                    <input data-row={ri} data-col={3} type="text" value={row.a2}
                      onChange={e => updateRow(ri, { a2: e.target.value })}
                      onFocus={() => selectCell(ri, 3)}
                      onKeyDown={e => handleKeyDown(e, ri, 3)}
                      onPaste={e => handlePaste(e, ri, 3)}
                      className={`${inputBase} text-gray-900`} />
                  </td>

                  {/* A3 */}
                  <td className={tdClass(ri, 4)} onMouseDown={e => handleTdMouseDown(e, ri, 4)}>
                    <input data-row={ri} data-col={4} type="text" value={row.a3}
                      onChange={e => updateRow(ri, { a3: e.target.value })}
                      onFocus={() => selectCell(ri, 4)}
                      onKeyDown={e => handleKeyDown(e, ri, 4)}
                      onPaste={e => handlePaste(e, ri, 4)}
                      className={`${inputBase} text-gray-900`} />
                  </td>

                  {/* A4 */}
                  <td className={tdClass(ri, 5)} onMouseDown={e => handleTdMouseDown(e, ri, 5)}>
                    <input data-row={ri} data-col={5} type="text" value={row.a4}
                      onChange={e => updateRow(ri, { a4: e.target.value })}
                      onFocus={() => selectCell(ri, 5)}
                      onKeyDown={e => handleKeyDown(e, ri, 5)}
                      onPaste={e => handlePaste(e, ri, 5)}
                      className={`${inputBase} text-gray-900`} />
                  </td>

                  {/* Time */}
                  <td className={tdClass(ri, 6)} onMouseDown={e => handleTdMouseDown(e, ri, 6)}>
                    <select data-row={ri} data-col={6} value={row.time}
                      onChange={e => updateRow(ri, { time: Number(e.target.value) })}
                      onFocus={() => selectCell(ri, 6)}
                      onKeyDown={e => handleKeyDown(e, ri, 6, true)}
                      className={`${inputBase} text-gray-700`}>
                      {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>

                  {/* Points */}
                  <td className={tdClass(ri, 7)} onMouseDown={e => handleTdMouseDown(e, ri, 7)}>
                    <select data-row={ri} data-col={7} value={row.points}
                      onChange={e => updateRow(ri, { points: Number(e.target.value) })}
                      onFocus={() => selectCell(ri, 7)}
                      onKeyDown={e => handleKeyDown(e, ri, 7, true)}
                      className={`${inputBase} text-gray-700`}>
                      {POINTS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>

                  {/* Actions */}
                  <td className="border-l border-gray-100 px-1 w-16">
                    {!empty && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => duplicateRow(ri)} title="Dupliceer (Ctrl+D)"
                          className="p-1 text-gray-400 hover:text-violet-600 transition-colors cursor-pointer rounded">
                          <Copy size={13} />
                        </button>
                        <button onClick={() => deleteRow(ri)} title="Verwijder"
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors cursor-pointer rounded">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between">
        <button onClick={goToFirstEmpty}
          className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-violet-50">
          ↓ Ga naar eerste lege rij
        </button>
        <p className="text-xs text-gray-400">
          Tab = volgende cel &nbsp;·&nbsp; Shift+klik = bereik selecteren &nbsp;·&nbsp; Ctrl+C = kopieer &nbsp;·&nbsp; Ctrl+V = plak
        </p>
      </div>
    </div>
  )
}
