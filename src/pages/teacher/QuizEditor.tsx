import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { Question, Option, QuestionType } from '../../types/database'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { SpreadsheetEditor } from '../../components/editor/SpreadsheetEditor'
import { PinZoneEditor } from '../../components/editor/PinZoneEditor'
import { ArrowLeft, Plus, Trash2, GripVertical, Check, Image, List, Shuffle, LayoutGrid, Table2, MessageSquare, MapPin } from 'lucide-react'

type DraftOption = Omit<Option, 'id' | 'question_id'> & { tempId: string }
type DraftQuestion = Omit<Question, 'id' | 'quiz_id'> & { tempId: string; options: DraftOption[] }

const TIME_OPTIONS = [
  { label: 'Geen timer', value: 0 },
  { label: '10 sec', value: 10 },
  { label: '20 sec', value: 20 },
  { label: '30 sec', value: 30 },
  { label: '60 sec', value: 60 },
  { label: '120 sec', value: 120 },
]

function newOption(overrides: Partial<DraftOption> = {}): DraftOption {
  return { tempId: crypto.randomUUID(), option_text: '', image_url: null, is_correct: false, correct_order: null, ...overrides }
}

function newQuestion(index: number): DraftQuestion {
  return {
    tempId: crypto.randomUUID(),
    question_type: 'multiple_choice',
    question_text: '',
    image_url: null,
    time_limit: 60,
    points_enabled: true,
    points_value: 1000,
    zone_polygon: null,
    order_index: index,
    options: [newOption(), newOption(), newOption(), newOption()],
  }
}

export default function QuizEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isNew = !id || id === 'new'

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>([newQuestion(0)])
  const [saving, setSaving] = useState(false)
  const [autoSaved, setAutoSaved] = useState<Date | null>(null)
  const [activeQ, setActiveQ] = useState(0)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const questionsRef = useRef(questions)
  const titleRef = useRef(title)

  useEffect(() => { questionsRef.current = questions }, [questions])
  useEffect(() => { titleRef.current = title }, [title])

  useEffect(() => {
    if (!isNew) loadQuiz()
  }, [id])

  async function loadQuiz() {
    const { data: quiz } = await supabase.from('quizzes').select('*').eq('id', id!).single()
    if (!quiz) return navigate('/teacher')
    setTitle(quiz.title)
    setDescription(quiz.description ?? '')

    const { data: qs } = await supabase.from('questions').select('*, options(*)').eq('quiz_id', id!).order('order_index')
    if (qs) {
      setQuestions(qs.map(q => ({
        ...q,
        tempId: q.id,
        options: (q.options as Option[]).map(o => ({ ...o, tempId: o.id })),
      })))
    }
  }

  function updateQuestion(idx: number, patch: Partial<DraftQuestion>) {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...patch } : q))
  }

  function updateOption(qIdx: number, oIdx: number, patch: Partial<DraftOption>) {
    setQuestions(qs => qs.map((q, i) => i !== qIdx ? q : {
      ...q,
      options: q.options.map((o, j) => j !== oIdx ? o : { ...o, ...patch }),
    }))
  }

  function addOption(qIdx: number) {
    const q = questions[qIdx]
    if (q.options.length >= 6) return
    updateQuestion(qIdx, { options: [...q.options, newOption()] })
  }

  function removeOption(qIdx: number, oIdx: number) {
    const q = questions[qIdx]
    if (q.options.length <= 2) return
    updateQuestion(qIdx, { options: q.options.filter((_, i) => i !== oIdx) })
  }

  function addQuestion() {
    setQuestions(qs => [...qs, newQuestion(qs.length)])
    setActiveQ(questions.length)
  }

  function removeQuestion(idx: number) {
    if (questions.length <= 1) return
    setQuestions(qs => qs.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order_index: i })))
    setActiveQ(Math.max(0, idx - 1))
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const reordered = Array.from(questions)
    const [moved] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, moved)
    setQuestions(reordered.map((q, i) => ({ ...q, order_index: i })))
    setActiveQ(result.destination.index)
  }

  const doSave = useCallback(async (silent: boolean, qs: DraftQuestion[], t: string) => {
    if (!t.trim()) return
    setSaving(true)

    let quizId: string = id ?? ''
    if (isNew) {
      const { data, error } = await supabase.from('quizzes').insert({ title: t, description, teacher_id: user?.id }).select().single()
      if (error || !data) {
        if (!silent) alert('Opslaan mislukt: ' + (error?.message ?? 'Onbekende fout. Ben je ingelogd?'))
        setSaving(false)
        return
      }
      quizId = data.id
    } else {
      await supabase.from('quizzes').update({ title: t, description }).eq('id', quizId)
      await supabase.from('questions').delete().eq('quiz_id', quizId)
    }

    for (const q of qs) {
      const qInsert: Record<string, unknown> = {
        quiz_id: quizId,
        question_type: q.question_type,
        question_text: q.question_text,
        image_url: q.image_url,
        time_limit: q.time_limit,
        points_enabled: q.points_enabled,
        points_value: q.points_value ?? 1000,
        order_index: q.order_index,
      }
      if (q.question_type === 'pin') qInsert.zone_polygon = q.zone_polygon

      const { data: savedQ } = await supabase.from('questions').insert(qInsert).select().single()

      if (savedQ && q.question_type !== 'brainstorm' && q.question_type !== 'pin' && q.options.length > 0) {
        const optionsWithOrder = q.options.map((o, i) => ({
          question_id: savedQ.id,
          option_text: o.option_text,
          image_url: o.image_url,
          is_correct: o.is_correct,
          correct_order: q.question_type === 'drag_order' ? i : o.correct_order,
        }))
        await supabase.from('options').insert(optionsWithOrder)
      }
    }

    setSaving(false)
    if (silent) {
      setAutoSaved(new Date())
    } else {
      navigate('/teacher')
    }
  }, [id, isNew, description, user?.id])

  async function saveQuiz() {
    if (!title.trim()) return alert('Geef de quiz een naam.')
    await doSave(false, questions, title)
  }

  // Autosave for existing quizzes (2 s debounce)
  useEffect(() => {
    if (isNew) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      doSave(true, questionsRef.current, titleRef.current)
    }, 2000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [questions, title, isNew, doSave])

  if (activeQ >= questions.length) setActiveQ(questions.length - 1)
  const q = questions[Math.min(activeQ, questions.length - 1)]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={() => navigate('/teacher')} className="text-gray-400 hover:text-gray-700 transition cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Naam van de quiz"
          className="flex-1 text-lg font-semibold text-gray-900 outline-none border-none bg-transparent placeholder-gray-300"
        />
        {/* View mode toggle */}
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg shrink-0">
          <button
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition cursor-pointer ${viewMode === 'cards' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <LayoutGrid size={14} /> Kaartjes
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition cursor-pointer ${viewMode === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Table2 size={14} /> Tabel
          </button>
        </div>
        {autoSaved && !saving && (
          <span className="text-xs text-gray-400 shrink-0">
            Opgeslagen {autoSaved.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {saving && <span className="text-xs text-gray-400 shrink-0">Opslaan...</span>}
        <Button onClick={saveQuiz} disabled={saving}>
          Opslaan & sluiten
        </Button>
      </header>

      {viewMode === 'table' ? (
        <div className="flex-1 overflow-hidden">
          <SpreadsheetEditor
            questions={questions}
            onChange={setQuestions}
            onSwitchToCardMode={() => setViewMode('cards')}
          />
        </div>
      ) : <div className="flex flex-1 overflow-hidden">
        {/* Question list sidebar */}
        <aside className="w-64 border-r border-gray-100 bg-white flex flex-col overflow-y-auto">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="questions">
              {provided => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="flex-1 p-3 flex flex-col gap-2">
                  {questions.map((q, i) => (
                    <Draggable key={q.tempId} draggableId={q.tempId} index={i}>
                      {(prov) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          onClick={() => setActiveQ(i)}
                          className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer group transition-colors ${activeQ === i ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-gray-50'}`}
                        >
                          <span {...prov.dragHandleProps} className="text-gray-300 hover:text-gray-500">
                            <GripVertical size={16} />
                          </span>
                          <span className="text-xs font-bold text-gray-400 w-5 shrink-0">{i + 1}</span>
                          <span className="text-sm text-gray-700 line-clamp-1 flex-1">
                            {q.question_text || <span className="text-gray-300 italic">Lege vraag</span>}
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); removeQuestion(i) }}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          <div className="p-3 border-t border-gray-100">
            <Button variant="secondary" className="w-full" onClick={addQuestion}>
              <Plus size={16} /> Vraag toevoegen
            </Button>
          </div>
        </aside>

        {/* Question editor */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Card className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
            {/* Question type selector */}
            <div className="flex gap-2 flex-wrap">
              {([
                ['multiple_choice', 'Meerkeuze', List],
                ['drag_order', 'Volgorde', Shuffle],
                ['select_image', 'Afbeelding', Image],
                ['brainstorm', 'Brainstorm', MessageSquare],
                ['pin', 'Pin plaatsen', MapPin],
              ] as [QuestionType, string, React.FC<{size?: number}>][]).map(([type, label, Icon]) => (
                <button
                  key={type}
                  onClick={() => {
                    const patch: Partial<DraftQuestion> = { question_type: type }
                    if (type === 'brainstorm') { patch.time_limit = 0; patch.points_enabled = false }
                    updateQuestion(activeQ, patch)
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${q.question_type === type ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {/* Question text */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Vraag</label>
              <textarea
                value={q.question_text}
                onChange={e => updateQuestion(activeQ, { question_text: e.target.value })}
                placeholder="Typ hier je vraag..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Image URL */}
            <Input
              label="Afbeelding URL (optioneel)"
              value={q.image_url ?? ''}
              onChange={e => updateQuestion(activeQ, { image_url: e.target.value || null })}
              placeholder="https://..."
            />
            {q.image_url && (
              <img src={q.image_url} alt="Voorbeeld" className="rounded-xl max-h-48 object-cover w-full" onError={e => (e.currentTarget.style.display = 'none')} />
            )}

            {/* Brainstorm info */}
            {q.question_type === 'brainstorm' && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-700">
                <p className="font-semibold mb-1">Brainstorm-vraag</p>
                <p>Leerlingen krijgen een invulvak en kunnen meerdere antwoorden insturen. Alle antwoorden verschijnen als sticky notes op het leerkrachtenscherm. Geen punten, geen timer.</p>
              </div>
            )}

            {/* Pin info + zone editor */}
            {q.question_type === 'pin' && (
              <div className="flex flex-col gap-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                  <p className="font-semibold mb-1">Pin plaatsen-vraag</p>
                  <p>Leerlingen klikken op de juiste plek in de afbeelding. Teken hieronder de correcte zone door punten te klikken.</p>
                </div>
                {q.image_url ? (
                  <PinZoneEditor
                    imageUrl={q.image_url}
                    polygon={q.zone_polygon ?? []}
                    onChange={poly => updateQuestion(activeQ, { zone_polygon: poly })}
                  />
                ) : (
                  <p className="text-sm text-gray-500 italic">Voer eerst een afbeelding URL in om de zone te tekenen.</p>
                )}
              </div>
            )}

            {/* Settings row — hidden for brainstorm */}
            {q.question_type !== 'brainstorm' && (
              <div className="flex gap-4 items-center flex-wrap">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Tijdslimiet</label>
                  <select
                    value={q.time_limit}
                    onChange={e => updateQuestion(activeQ, { time_limit: Number(e.target.value) })}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={q.points_enabled}
                    onChange={e => updateQuestion(activeQ, { points_enabled: e.target.checked })}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className="text-sm text-gray-700">Punten</span>
                </label>
                {q.points_enabled && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Punten waarde</label>
                    <select
                      value={q.points_value ?? 1000}
                      onChange={e => updateQuestion(activeQ, { points_value: Number(e.target.value) })}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      {[250, 500, 750, 1000, 1500, 2000].map(v => (
                        <option key={v} value={v}>{v} pts</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Options — only for MC / drag / image types */}
            {(q.question_type === 'multiple_choice' || q.question_type === 'drag_order' || q.question_type === 'select_image') && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-3">
                  {q.question_type === 'drag_order' ? 'Items (sleep om volgorde aan te passen)' : 'Antwoordopties'}
                </label>
                <div className="flex flex-col gap-2">
                  {q.options.map((opt, oIdx) => (
                    <div key={opt.tempId} className="flex items-center gap-2">
                      {q.question_type === 'multiple_choice' && (
                        <button
                          onClick={() => updateOption(activeQ, oIdx, { is_correct: !opt.is_correct })}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition cursor-pointer ${opt.is_correct ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}
                        >
                          {opt.is_correct && <Check size={12} />}
                        </button>
                      )}
                      {q.question_type === 'select_image' ? (
                        <div className="flex-1 flex flex-col gap-1.5">
                          <div className="flex gap-2 items-center">
                            <input
                              value={opt.option_text ?? ''}
                              onChange={e => updateOption(activeQ, oIdx, { option_text: e.target.value })}
                              placeholder={`Label ${oIdx + 1}`}
                              className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 shrink-0"
                            />
                            <input
                              value={opt.image_url ?? ''}
                              onChange={e => updateOption(activeQ, oIdx, { image_url: e.target.value || null })}
                              placeholder="Afbeelding URL (https://...)"
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                            />
                            <button
                              onClick={() => updateOption(activeQ, oIdx, { is_correct: !opt.is_correct })}
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition cursor-pointer ${opt.is_correct ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}
                            >
                              {opt.is_correct && <Check size={12} />}
                            </button>
                          </div>
                          {opt.image_url && (
                            <img
                              src={opt.image_url}
                              alt=""
                              className="h-24 rounded-lg object-contain bg-gray-100 w-full"
                              onError={e => (e.currentTarget.style.display = 'none')}
                              onLoad={e => (e.currentTarget.style.display = 'block')}
                            />
                          )}
                        </div>
                      ) : (
                        <input
                          value={opt.option_text ?? ''}
                          onChange={e => updateOption(activeQ, oIdx, { option_text: e.target.value })}
                          placeholder={`Optie ${oIdx + 1}`}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      )}
                      <button
                        onClick={() => removeOption(activeQ, oIdx)}
                        className="text-gray-300 hover:text-red-400 transition cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                {q.question_type !== 'select_image' && q.options.length < 6 && (
                  <button
                    onClick={() => addOption(activeQ)}
                    className="mt-3 flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 transition cursor-pointer"
                  >
                    <Plus size={14} /> Optie toevoegen
                  </button>
                )}
                {q.question_type === 'select_image' && q.options.length < 4 && (
                  <button
                    onClick={() => addOption(activeQ)}
                    className="mt-3 flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 transition cursor-pointer"
                  >
                    <Plus size={14} /> Afbeelding toevoegen
                  </button>
                )}
              </div>
            )}
          </Card>
        </main>
      </div>}
    </div>
  )
}

