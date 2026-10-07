import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { GameSession, Player, Response } from '../../types/database'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ArrowLeft, Download, ChevronRight, ChevronLeft, Check, X } from 'lucide-react'

interface Option { id: string; option_text: string | null; is_correct: boolean; correct_order: number | null }
interface Question { id: string; question_text: string; question_type: string; order_index: number; options: Option[] }
interface Quiz { id: string; title: string; questions: Question[] }

interface SessionData extends GameSession {
  players: Player[]
  responses: Response[]
}

type View = 'leaderboard' | 'questions' | 'student'

export default function QuizResults() {
  const { quizId } = useParams()
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('leaderboard')
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)

  useEffect(() => { loadResults() }, [quizId])

  async function loadResults() {
    const [{ data: quizData }, { data: gameSessions }] = await Promise.all([
      supabase.from('quizzes').select('*, questions(*, options(*))').eq('id', quizId!).single(),
      supabase.from('game_sessions').select('*').eq('quiz_id', quizId!).eq('status', 'finished').order('created_at', { ascending: false }),
    ])

    if (quizData) {
      const sorted = { ...quizData, questions: (quizData.questions ?? []).sort((a: Question, b: Question) => a.order_index - b.order_index) }
      setQuiz(sorted as Quiz)
    }

    if (!gameSessions) { setLoading(false); return }

    const enriched: SessionData[] = await Promise.all(gameSessions.map(async (sess) => {
      const [{ data: players }, { data: responses }] = await Promise.all([
        supabase.from('players').select('*').eq('session_id', sess.id).order('total_score', { ascending: false }),
        supabase.from('responses').select('*').eq('session_id', sess.id),
      ])
      return { ...sess, players: players ?? [], responses: responses ?? [] }
    }))

    setSessions(enriched)
    if (enriched.length > 0) setSelectedId(enriched[0].id)
    setLoading(false)
  }

  function exportCSV(sess: SessionData) {
    const questions = quiz?.questions ?? []
    const header = ['Rang', 'Naam', 'Score', 'Juist', 'Fout', ...questions.map((_, i) => `V${i + 1}`)].join(',')
    const sorted = [...sess.players].sort((a, b) => b.total_score - a.total_score)
    const rows = sorted.map((p, i) => {
      const pResponses = sess.responses.filter(r => r.player_id === p.id)
      const correct = pResponses.filter(r => r.is_correct).length
      const wrong = pResponses.filter(r => !r.is_correct).length
      const qCols = questions.map(q => {
        const r = pResponses.find(r => r.question_id === q.id)
        return r ? (r.is_correct ? 'juist' : 'fout') : '-'
      })
      return [i + 1, p.nickname, p.total_score, correct, wrong, ...qCols].join(',')
    })
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `klasquiz-${sess.pin_code}.csv`
    a.click()
  }

  const sess = sessions.find(s => s.id === selectedId)
  const sortedPlayers = sess ? [...sess.players].sort((a, b) => b.total_score - a.total_score) : []

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/teacher')} className="text-gray-400 hover:text-gray-700 transition cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Resultaten: {quiz?.title ?? '...'}</h1>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center text-gray-400 py-20">Laden...</div>
        ) : sessions.length === 0 ? (
          <Card className="p-12 text-center text-gray-400">Nog geen voltooide sessies voor deze quiz.</Card>
        ) : (
          <div className="flex gap-6">

            {/* Session sidebar */}
            <aside className="w-52 shrink-0">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Sessies</h3>
              <div className="flex flex-col gap-2">
                {sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedId(s.id); setView('leaderboard'); setSelectedPlayer(null) }}
                    className={`text-left px-3 py-2 rounded-xl text-sm transition cursor-pointer ${selectedId === s.id ? 'bg-violet-100 text-violet-700 font-medium' : 'hover:bg-gray-100 text-gray-600'}`}
                  >
                    <span className="font-bold">PIN: {s.pin_code}</span>
                    <br />
                    <span className="text-xs text-gray-400">{s.players.length} speler{s.players.length !== 1 ? 's' : ''}</span>
                    <br />
                    <span className="text-xs text-gray-400">{formatDate(s.created_at)}</span>
                  </button>
                ))}
              </div>
            </aside>

            {/* Main panel */}
            {sess && (
              <div className="flex-1 min-w-0">

                {/* Header */}
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    {view === 'student' && (
                      <button onClick={() => { setView('leaderboard'); setSelectedPlayer(null) }} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                        <ChevronLeft size={20} />
                      </button>
                    )}
                    <h3 className="font-semibold text-gray-700">
                      {view === 'student' && selectedPlayer ? selectedPlayer.nickname : `PIN: ${sess.pin_code} · ${formatDate(sess.created_at)}`}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {view !== 'student' && (
                      <>
                        <button
                          onClick={() => setView('leaderboard')}
                          className={`text-sm px-3 py-1.5 rounded-lg transition cursor-pointer ${view === 'leaderboard' ? 'bg-violet-100 text-violet-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                          Klassement
                        </button>
                        <button
                          onClick={() => setView('questions')}
                          className={`text-sm px-3 py-1.5 rounded-lg transition cursor-pointer ${view === 'questions' ? 'bg-violet-100 text-violet-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                          Per vraag
                        </button>
                      </>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => exportCSV(sess)}>
                      <Download size={14} /> CSV
                    </Button>
                  </div>
                </div>

                {/* LEADERBOARD VIEW */}
                {view === 'leaderboard' && (
                  <Card className="overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium text-gray-600 w-10">#</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Naam</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Score</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Juist</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Fout</th>
                          <th className="px-4 py-3 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPlayers.map((player, i) => {
                          const pRes = sess.responses.filter(r => r.player_id === player.id)
                          const correct = pRes.filter(r => r.is_correct).length
                          const wrong = pRes.filter(r => !r.is_correct).length
                          return (
                            <tr
                              key={player.id}
                              className={`cursor-pointer hover:bg-violet-50 transition ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                              onClick={() => { setSelectedPlayer(player); setView('student') }}
                            >
                              <td className="px-4 py-3 text-gray-400 font-bold">{i + 1}</td>
                              <td className="px-4 py-3 text-gray-800 font-medium">{player.nickname}</td>
                              <td className="px-4 py-3 text-violet-700 font-bold">{player.total_score}</td>
                              <td className="px-4 py-3">
                                <span className="text-green-600 font-semibold">{correct}</span>
                                <span className="text-gray-400 text-xs"> / {pRes.length}</span>
                              </td>
                              <td className="px-4 py-3 text-red-500 font-semibold">{wrong}</td>
                              <td className="px-4 py-3 text-gray-300"><ChevronRight size={16} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </Card>
                )}

                {/* PER VRAAG VIEW */}
                {view === 'questions' && quiz && (
                  <div className="flex flex-col gap-3">
                    {quiz.questions.map((q, qi) => {
                      const qRes = sess.responses.filter(r => r.question_id === q.id)
                      const correct = qRes.filter(r => r.is_correct).length
                      const wrong = qRes.filter(r => !r.is_correct).length
                      const total = correct + wrong
                      const pct = total > 0 ? Math.round((correct / total) * 100) : 0
                      return (
                        <Card key={q.id} className="p-4">
                          <div className="flex items-start gap-4">
                            <span className="text-gray-400 font-bold text-sm w-6 shrink-0 mt-0.5">{qi + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-800 mb-2">{q.question_text}</p>
                              {/* Progress bar */}
                              <div className="flex items-center gap-3 mb-3">
                                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-sm font-bold text-green-600 w-10 text-right">{pct}%</span>
                              </div>
                              <div className="flex gap-4 text-sm">
                                <span className="flex items-center gap-1 text-green-600"><Check size={14} /> {correct} juist</span>
                                <span className="flex items-center gap-1 text-red-500"><X size={14} /> {wrong} fout</span>
                                <span className="text-gray-400">{sess.players.length - total} niet geantwoord</span>
                              </div>
                              {/* Answer breakdown for MC */}
                              {(q.question_type === 'multiple_choice' || q.question_type === 'select_image') && q.options.length > 0 && (
                                <div className="mt-3 flex flex-col gap-1">
                                  {q.options.map(opt => {
                                    const count = qRes.filter(r => r.option_id === opt.id).length
                                    const optPct = total > 0 ? Math.round((count / total) * 100) : 0
                                    return (
                                      <div key={opt.id} className="flex items-center gap-2 text-xs">
                                        <span className={`w-3 h-3 rounded-full shrink-0 ${opt.is_correct ? 'bg-green-500' : 'bg-gray-300'}`} />
                                        <span className={`flex-1 truncate ${opt.is_correct ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>{opt.option_text}</span>
                                        <span className="text-gray-400 w-6 text-right">{count}</span>
                                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full ${opt.is_correct ? 'bg-green-500' : 'bg-gray-400'}`} style={{ width: `${optPct}%` }} />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                )}

                {/* STUDENT DETAIL VIEW */}
                {view === 'student' && selectedPlayer && quiz && (
                  <div className="flex flex-col gap-3">
                    {/* Summary */}
                    <div className="flex gap-3 mb-1">
                      {(() => {
                        const pRes = sess.responses.filter(r => r.player_id === selectedPlayer.id)
                        const correct = pRes.filter(r => r.is_correct).length
                        const wrong = pRes.filter(r => !r.is_correct).length
                        return (
                          <>
                            <div className="bg-violet-100 rounded-xl px-4 py-2 text-center">
                              <p className="text-xs text-violet-400">Score</p>
                              <p className="text-xl font-black text-violet-700">{selectedPlayer.total_score}</p>
                            </div>
                            <div className="bg-green-50 rounded-xl px-4 py-2 text-center">
                              <p className="text-xs text-green-500">Juist</p>
                              <p className="text-xl font-black text-green-600">{correct}</p>
                            </div>
                            <div className="bg-red-50 rounded-xl px-4 py-2 text-center">
                              <p className="text-xs text-red-400">Fout</p>
                              <p className="text-xl font-black text-red-500">{wrong}</p>
                            </div>
                          </>
                        )
                      })()}
                    </div>

                    {/* Per question */}
                    {quiz.questions.map((q, qi) => {
                      const r = sess.responses.find(r => r.player_id === selectedPlayer.id && r.question_id === q.id)
                      const chosenOption = r?.option_id ? q.options.find(o => o.id === r.option_id) : null
                      const correctOption = q.options.find(o => o.is_correct)
                      return (
                        <Card key={q.id} className={`p-4 border-l-4 ${!r ? 'border-gray-200' : r.is_correct ? 'border-green-500' : 'border-red-500'}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-white text-sm font-bold ${!r ? 'bg-gray-300' : r.is_correct ? 'bg-green-500' : 'bg-red-500'}`}>
                              {!r ? '?' : r.is_correct ? '✓' : '✗'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-400 mb-0.5">Vraag {qi + 1}</p>
                              <p className="font-semibold text-gray-800 mb-1">{q.question_text}</p>
                              {!r && <p className="text-sm text-gray-400 italic">Niet geantwoord</p>}
                              {r && q.question_type === 'multiple_choice' && (
                                <div className="text-sm flex flex-col gap-0.5">
                                  {chosenOption && !chosenOption.is_correct && (
                                    <span className="text-red-600">Geantwoord: {chosenOption.option_text}</span>
                                  )}
                                  {correctOption && (
                                    <span className="text-green-600 font-medium">Juist antwoord: {correctOption.option_text}</span>
                                  )}
                                  {chosenOption?.is_correct && (
                                    <span className="text-green-600">Geantwoord: {chosenOption.option_text}</span>
                                  )}
                                </div>
                              )}
                              {r && (q.question_type === 'brainstorm') && r.response_text && (
                                <p className="text-sm text-gray-600 italic">"{r.response_text}"</p>
                              )}
                              {r && r.points_awarded > 0 && (
                                <p className="text-xs text-violet-500 mt-1">+{r.points_awarded} pts</p>
                              )}
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                )}

              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
