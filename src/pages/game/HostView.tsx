import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { GameSession, QuizWithQuestions, Player, Response } from '../../types/database'
import { Button } from '../../components/ui/Button'
import { Users, Timer, Trophy, ChevronRight, Eye, EyeOff, BarChart2 } from 'lucide-react'
import { Fireworks } from '../../components/game/Fireworks'
import { Avatar } from '../../components/game/Avatar'

const OPTION_COLORS = [
  'bg-red-500', 'bg-blue-500', 'bg-yellow-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
]
const OPTION_LIGHT = [
  'bg-red-100 border-red-300', 'bg-blue-100 border-blue-300', 'bg-yellow-100 border-yellow-300',
  'bg-green-100 border-green-300', 'bg-purple-100 border-purple-300', 'bg-pink-100 border-pink-300',
]
const OPTION_BAR = [
  'bg-red-500', 'bg-blue-500', 'bg-yellow-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
]

type Screen = 'question' | 'results' | 'leaderboard'

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 text-left cursor-pointer group">
      <div className={`w-12 h-6 rounded-full relative transition-colors ${active ? 'bg-yellow-400' : 'bg-white/20 group-hover:bg-white/30'}`}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${active ? 'left-6' : 'left-0.5'}`} />
      </div>
      <span className={`text-sm font-medium ${active ? 'text-yellow-300' : 'text-violet-200'}`}>{label}</span>
    </button>
  )
}

export default function HostView() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<GameSession | null>(null)
  const [quiz, setQuiz] = useState<QuizWithQuestions | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [responses, setResponses] = useState<Response[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [screen, setScreen] = useState<Screen>('question')
  const [timerActive, setTimerActive] = useState(false)
  const [showNames, setShowNames] = useState(false)
  const [shuffleQuestions, setShuffleQuestions] = useState(false)
  const [hideScores, setHideScores] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    loadData()

    const playerSub = supabase
      .channel(`session-${sessionId}-players`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` },
        payload => setPlayers(p => [...p, payload.new as Player]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` },
        payload => setPlayers(p => p.map(x => x.id === (payload.new as Player).id ? payload.new as Player : x)))
      .subscribe()

    const responseSub = supabase
      .channel(`session-${sessionId}-responses`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'responses', filter: `session_id=eq.${sessionId}` },
        payload => setResponses(p => [...p, payload.new as Response]))
      .subscribe()

    return () => {
      supabase.removeChannel(playerSub)
      supabase.removeChannel(responseSub)
    }
  }, [sessionId])

  async function loadData() {
    const { data: sess } = await supabase.from('game_sessions').select('*').eq('id', sessionId).single()
    setSession(sess)
    if (sess) {
      const { data: q } = await supabase
        .from('quizzes').select('*, questions(*, options(*))')
        .eq('id', sess.quiz_id).single()
      if (q) {
        let questions = q.questions.sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
        if (sess.question_order?.length > 0) {
          questions = sess.question_order
            .map((id: string) => questions.find((question: { id: string }) => question.id === id))
            .filter(Boolean)
        }
        setQuiz({ ...q, questions } as QuizWithQuestions)
      }
      const { data: ps } = await supabase.from('players').select('*').eq('session_id', sessionId)
      setPlayers(ps ?? [])
    }
  }

  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setTimerActive(false); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [timerActive, timeLeft])

  async function startQuiz() {
    let questions = [...quiz!.questions]
    let question_order = questions.map(q => q.id)
    if (shuffleQuestions) {
      question_order = [...question_order].sort(() => Math.random() - 0.5)
      questions = question_order.map(id => questions.find(q => q.id === id)!)
      setQuiz(qz => qz ? { ...qz, questions } : qz)
    }
    await supabase.from('game_sessions').update({
      status: 'active', current_question_index: 0,
      answer_visible: false, hide_scores: hideScores, question_order,
    }).eq('id', sessionId)
    setSession(s => s ? { ...s, status: 'active', current_question_index: 0, answer_visible: false, hide_scores: hideScores, question_order } : s)
    setScreen('question')
    startTimer(questions[0].time_limit)
  }

  function startTimer(limit: number) {
    if (limit > 0) { setTimeLeft(limit); setTimerActive(true) }
    else { setTimeLeft(0); setTimerActive(false) }
  }

  async function goToResults() {
    setTimerActive(false)
    await supabase.from('game_sessions').update({ answer_visible: true }).eq('id', sessionId)
    setSession(s => s ? { ...s, answer_visible: true } : s)
    const { data } = await supabase.from('players').select('*').eq('session_id', sessionId)
    if (data) setPlayers(data)
    setShowNames(false)
    setScreen('results')
  }

  async function goToLeaderboard() {
    if (hideScores) { await nextQuestion(); return }
    setScreen('leaderboard')
  }

  async function nextQuestion() {
    if (!session || !quiz) return
    const next = session.current_question_index + 1
    if (next >= quiz.questions.length) {
      await supabase.from('game_sessions').update({ status: 'finished', is_active: false, answer_visible: false }).eq('id', sessionId)
      const { data } = await supabase.from('players').select('*').eq('session_id', sessionId)
      if (data) setPlayers(data)
      setSession(s => s ? { ...s, status: 'finished' } : s)
      return
    }
    setScreen('question')
    setResponses([])
    await supabase.from('game_sessions').update({ current_question_index: next, answer_visible: false }).eq('id', sessionId)
    setSession(s => s ? { ...s, current_question_index: next, answer_visible: false } : s)
    startTimer(quiz.questions[next].time_limit)
  }

  async function endGame() {
    await supabase.from('game_sessions').update({ status: 'finished', is_active: false }).eq('id', sessionId)
    navigate('/teacher')
  }

  const currentQ = quiz && session ? quiz.questions[session.current_question_index] : null
  const visibleOptions = currentQ?.options.filter(o => o.option_text?.trim() || o.image_url) ?? []
  const currentResponses = responses.filter(r => currentQ && r.question_id === currentQ.id)
  const topPlayers = [...players].sort((a, b) => b.total_score - a.total_score).slice(0, 5)

  // Auto-advance to results when all players answered (not for brainstorm)
  useEffect(() => {
    if (currentQ?.question_type === 'brainstorm' || currentQ?.question_type === 'pin') return
    if (players.length > 0 && currentResponses.length >= players.length && screen === 'question' && session?.status === 'active') {
      goToResults()
    }
  }, [currentResponses.length, players.length])

  if (!session || !quiz) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Laden...</div>

  // Lobby
  if (session.status === 'lobby') return (
    <div className="min-h-screen bg-gradient-to-br from-violet-800 to-indigo-900 flex flex-col items-center justify-center text-white gap-8">
      <h1 className="text-3xl font-black">{quiz.title}</h1>
      <div className="text-center">
        <p className="text-violet-300 text-sm uppercase tracking-wider mb-3">Surf naar <span className="text-white font-bold">tinyurl.com/klasquiz</span></p>
        <div className="border-4 border-yellow-400 rounded-3xl px-10 py-5 inline-block">
          <p className="text-yellow-400 text-xs uppercase tracking-widest font-bold mb-1">SPELPIN</p>
          <p className="text-8xl font-black tracking-widest text-yellow-400">{session.pin_code}</p>
        </div>
      </div>
      <div className="bg-white/10 rounded-2xl px-8 py-5 flex items-center gap-3">
        <Users size={20} className="text-violet-300" />
        <span className="text-xl font-bold">{players.length} speler{players.length !== 1 ? 's' : ''}</span>
      </div>
      {players.length > 0 && (
        <div className="flex flex-wrap gap-3 max-w-3xl justify-center">
          {players.map(p => (
            <div key={p.id} className="flex items-center gap-2 bg-white/20 pl-1 pr-4 py-1.5 rounded-full">
              <Avatar avatar={p.avatar} size="sm" />
              <span className="font-medium">{p.nickname}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-3 items-center">
        <Toggle active={shuffleQuestions} onClick={() => setShuffleQuestions(v => !v)} label="Shuffle vragen" />
        <Toggle active={hideScores} onClick={() => setHideScores(v => !v)} label="Verberg punten & leaderboard" />
      </div>
      <Button size="lg" onClick={startQuiz} disabled={players.length === 0} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold text-lg px-10">
        Start quiz!
      </Button>
    </div>
  )

  // Finished
  if (session.status === 'finished') return (
    <div className="min-h-screen bg-gradient-to-br from-violet-800 to-indigo-900 flex flex-col items-center justify-center text-white gap-8">
      <Fireworks />
      <Trophy size={64} className="text-yellow-400" />
      <h1 className="text-3xl font-black">Einduitslag</h1>
      <div className="flex gap-4 items-end">
        {topPlayers[1] && (
          <div className="flex flex-col items-center gap-2">
            <Avatar avatar={topPlayers[1].avatar} size="md" />
            <span className="text-lg font-bold">{topPlayers[1].nickname}</span>
            <div className="bg-gray-400 w-24 h-24 rounded-t-2xl flex items-end justify-center pb-3 text-2xl font-black">2</div>
            <span className="font-bold">{topPlayers[1].total_score} pts</span>
          </div>
        )}
        {topPlayers[0] && (
          <div className="flex flex-col items-center gap-2">
            <Avatar avatar={topPlayers[0].avatar} size="lg" />
            <span className="text-xl font-bold">{topPlayers[0].nickname}</span>
            <div className="bg-yellow-400 text-gray-900 w-28 h-32 rounded-t-2xl flex items-end justify-center pb-3 text-3xl font-black">1</div>
            <span className="font-bold text-lg">{topPlayers[0].total_score} pts</span>
          </div>
        )}
        {topPlayers[2] && (
          <div className="flex flex-col items-center gap-2">
            <Avatar avatar={topPlayers[2].avatar} size="md" />
            <span className="text-lg font-bold">{topPlayers[2].nickname}</span>
            <div className="bg-amber-700 w-24 h-16 rounded-t-2xl flex items-end justify-center pb-3 text-2xl font-black">3</div>
            <span className="font-bold">{topPlayers[2].total_score} pts</span>
          </div>
        )}
      </div>
      <Button variant="secondary" onClick={() => navigate('/teacher')} size="lg">
        Terug naar dashboard
      </Button>
    </div>
  )

  // Brainstorm: sticky notes during active question
  if (screen === 'question' && currentQ?.question_type === 'brainstorm') {
    const notes = currentResponses.filter(r => r.response_text)
    const STICKY = ['bg-yellow-200', 'bg-pink-200', 'bg-blue-200', 'bg-green-200', 'bg-purple-200', 'bg-orange-200']
    const ROTATIONS = [-3, -1, 0, 1, 2, -2]
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 bg-black/30">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Brainstorm — {(session.current_question_index ?? 0) + 1} / {quiz.questions.length}</span>
            <span className="text-xs bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-2 py-0.5 rounded-full font-bold tracking-wider">PIN {session.pin_code}</span>
          </div>
          <span className="text-sm text-gray-400">{notes.length} antwoord{notes.length !== 1 ? 'en' : ''} · {players.length} spelers</span>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-3xl font-black text-center mb-8 max-w-3xl mx-auto">{currentQ.question_text}</h2>
          {notes.length === 0 ? (
            <p className="text-gray-500 text-center">Nog geen antwoorden...</p>
          ) : (
            <div className="flex flex-wrap gap-4 justify-center">
              {notes.map((r, i) => {
                const player = players.find(p => p.id === r.player_id)
                return (
                  <div
                    key={r.id}
                    className={`${STICKY[i % STICKY.length]} rounded-sm shadow-xl p-4 w-44 text-gray-800 shrink-0`}
                    style={{ transform: `rotate(${ROTATIONS[i % ROTATIONS.length]}deg)` }}
                  >
                    <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">{player?.nickname ?? '?'}</p>
                    <p className="text-sm font-medium leading-snug break-words">{r.response_text}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="px-6 py-4 flex justify-end border-t border-gray-800">
          <Button size="lg" onClick={goToLeaderboard} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold">
            Volgende vraag <ChevronRight size={20} />
          </Button>
        </div>
      </div>
    )
  }

  // Drag order results: correct order + per-student submitted orders
  if (screen === 'results' && currentQ?.question_type === 'drag_order') {
    const correctOrder = [...currentQ.options].sort((a, b) => (a.correct_order ?? 0) - (b.correct_order ?? 0))
    const dragResponses = currentResponses.filter(r => r.response_text)
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 bg-black/30">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Vraag {(session.current_question_index ?? 0) + 1} / {quiz.questions.length} — Resultaten</span>
            <span className="text-xs bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-2 py-0.5 rounded-full font-bold tracking-wider">PIN {session.pin_code}</span>
          </div>
          <span className="text-sm text-gray-400">{dragResponses.length} / {players.length} geantwoord</span>
        </div>
        <div className="flex-1 flex flex-col items-center px-6 py-6 gap-6 overflow-y-auto">
          <h2 className="text-2xl font-black text-center max-w-3xl">{currentQ.question_text}</h2>
          <div className="w-full max-w-2xl">
            <p className="text-xs text-green-400 font-bold uppercase tracking-wider mb-3">✓ Juiste volgorde</p>
            <div className="flex flex-col gap-2">
              {correctOrder.map((opt, i) => (
                <div key={opt.id} className="bg-green-500/20 border border-green-500/40 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center font-black text-sm shrink-0">{i + 1}</span>
                  {opt.image_url && <img src={opt.image_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-black/20 shrink-0" />}
                  <span className="font-semibold">{opt.option_text}</span>
                </div>
              ))}
            </div>
          </div>
          {dragResponses.length > 0 && (
            <div className="w-full max-w-2xl">
              <button
                onClick={() => setShowNames(s => !s)}
                className={`mb-3 px-4 py-2 rounded-xl font-bold text-sm transition cursor-pointer ${showNames ? 'bg-violet-500 text-white hover:bg-violet-400' : 'bg-violet-500/30 text-violet-300 border border-violet-500/50 hover:bg-violet-500/50'}`}
              >
                {showNames ? '▼ Verberg leerlingenantwoorden' : `▶ Toon leerlingenantwoorden (${dragResponses.length})`}
              </button>
              {showNames && (
                <div className="flex flex-col gap-4">
                  {dragResponses.map(r => {
                    const player = players.find(p => p.id === r.player_id)
                    let submittedIds: string[] = []
                    try { submittedIds = JSON.parse(r.response_text ?? '[]') } catch { /* invalid json */ }
                    const submittedOrder = submittedIds.map(id => currentQ.options.find(o => o.id === id)).filter(Boolean)
                    return (
                      <div key={r.id} className={`rounded-xl border-2 overflow-hidden ${r.is_correct ? 'border-green-500/40 bg-green-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
                        <div className="px-4 py-2 flex items-center gap-2 border-b border-white/10">
                          <Avatar avatar={player?.avatar ?? {}} size="xs" />
                          <span className="font-bold text-sm">{player?.nickname ?? '?'}</span>
                          {r.is_correct
                            ? <span className="ml-auto text-green-400 font-bold text-xs">✓ Juist</span>
                            : <span className="ml-auto text-red-400 font-bold text-xs">✗ Fout</span>
                          }
                        </div>
                        <div className="flex flex-col gap-1 px-4 py-3">
                          {submittedOrder.map((opt, i) => {
                            const isCorrectPos = correctOrder[i]?.id === opt?.id
                            return (
                              <div key={opt?.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${isCorrectPos ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                                <span className="w-5 font-black">{i + 1}.</span>
                                {opt?.image_url && <img src={opt.image_url} alt="" className="w-6 h-6 rounded object-contain bg-black/20 shrink-0" />}
                                <span>{opt?.option_text}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 flex items-center justify-end border-t border-gray-800">
          <Button size="lg" onClick={goToLeaderboard} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold">
            <BarChart2 size={18} /> Leaderboard
          </Button>
        </div>
      </div>
    )
  }

  // Pin results: dot cloud on image
  if (screen === 'results' && currentQ?.question_type === 'pin') {
    const pinResponses = currentResponses.filter(r => r.response_x != null && r.response_y != null)
    const correctCount = pinResponses.filter(r => r.is_correct).length
    const zone = currentQ.zone_polygon ?? []
    const zoneStr = zone.map(p => `${p.x},${p.y}`).join(' ')
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 bg-black/30">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Vraag {(session.current_question_index ?? 0) + 1} / {quiz.questions.length} — Resultaten</span>
            <span className="text-xs bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-2 py-0.5 rounded-full font-bold tracking-wider">PIN {session.pin_code}</span>
          </div>
          <span className="text-sm text-gray-400">{pinResponses.length} / {players.length} geantwoord</span>
        </div>
        <div className="flex-1 flex flex-col items-center px-6 py-6 gap-5 overflow-y-auto">
          <h2 className="text-2xl font-black text-center">{currentQ.question_text}</h2>
          {currentQ.image_url && (
            <div className="relative w-full max-w-2xl" style={{ userSelect: 'none' }}>
              <img src={currentQ.image_url} alt="" className="w-full rounded-2xl block" />
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {zone.length >= 3 && (
                  <polygon points={zoneStr} fill="rgba(34,197,94,0.2)" stroke="rgb(34,197,94)" strokeWidth="0.5" />
                )}
                {pinResponses.map(r => (
                  <circle key={r.id} cx={r.response_x!} cy={r.response_y!} r="1.8"
                    fill={r.is_correct ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.85)'}
                    stroke="white" strokeWidth="0.4" />
                ))}
              </svg>
            </div>
          )}
          <div className="flex gap-6 text-center">
            <div className="bg-green-500/20 border border-green-500/40 rounded-2xl px-6 py-3">
              <p className="text-3xl font-black text-green-400">{correctCount}</p>
              <p className="text-sm text-green-300">Juist</p>
            </div>
            <div className="bg-red-500/20 border border-red-500/40 rounded-2xl px-6 py-3">
              <p className="text-3xl font-black text-red-400">{pinResponses.length - correctCount}</p>
              <p className="text-sm text-red-300">Fout</p>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-3">
              <p className="text-3xl font-black">
                {pinResponses.length > 0 ? Math.round((correctCount / pinResponses.length) * 100) : 0}%
              </p>
              <p className="text-sm text-gray-400">Juist</p>
            </div>
          </div>
          {showNames && (
            <div className="w-full max-w-2xl">
              <p className="text-sm text-gray-400 mb-2">Juist: {pinResponses.filter(r => r.is_correct).map(r => players.find(p => p.id === r.player_id)?.nickname).filter(Boolean).join(', ') || '—'}</p>
              <p className="text-sm text-gray-400">Fout: {pinResponses.filter(r => !r.is_correct).map(r => players.find(p => p.id === r.player_id)?.nickname).filter(Boolean).join(', ') || '—'}</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 flex items-center justify-between border-t border-gray-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNames(s => !s)}
            className={showNames ? 'bg-violet-500 text-white hover:bg-violet-400' : 'bg-violet-500/30 text-violet-300 border border-violet-500/50 hover:bg-violet-500/50'}
          >
            {showNames ? <><EyeOff size={16} /> Verberg namen</> : <><Eye size={16} /> Toon namen</>}
          </Button>
          <Button size="lg" onClick={goToLeaderboard} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold">
            <BarChart2 size={18} /> Leaderboard
          </Button>
        </div>
      </div>
    )
  }

  // Results screen: answer distribution
  if (screen === 'results' && currentQ) {
    const total = currentResponses.length
    const breakdown = visibleOptions.map((opt, i) => {
      const respondents = currentResponses.filter(r => r.option_id === opt.id)
      const playerNames = respondents
        .map(r => players.find(p => p.id === r.player_id)?.nickname)
        .filter(Boolean) as string[]
      return { opt, i, count: respondents.length, playerNames }
    })
    // Also count unanswered
    const answeredIds = new Set(currentResponses.map(r => r.player_id))
    const unanswered = players.filter(p => !answeredIds.has(p.id))

    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 bg-black/30">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Vraag {(session.current_question_index ?? 0) + 1} / {quiz.questions.length} — Resultaten</span>
            <span className="text-xs bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-2 py-0.5 rounded-full font-bold tracking-wider">PIN {session.pin_code}</span>
          </div>
          <span className="text-sm text-gray-400">{total} / {players.length} geantwoord</span>
        </div>

        <div className="flex-1 flex flex-col items-center px-6 py-6 gap-5 overflow-y-auto">
          <h2 className="text-2xl font-black text-center max-w-3xl">{currentQ.question_text}</h2>

          <div className="w-full max-w-3xl flex flex-col gap-3">
            {breakdown.map(({ opt, i, count, playerNames }) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={opt.id} className={`rounded-2xl border-2 overflow-hidden ${OPTION_LIGHT[i]}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    {opt.image_url && <img src={opt.image_url} alt="" className="w-12 h-12 rounded-lg object-contain bg-white/50 shrink-0" />}
                    <span className="flex-1 font-bold text-gray-900">{opt.option_text}</span>
                    {opt.is_correct && <span className="text-green-700 font-bold text-sm bg-green-100 px-2 py-0.5 rounded-full border border-green-300">✓ Juist</span>}
                    <span className="font-black text-xl text-gray-900 min-w-8 text-right">{count}</span>
                    <span className="text-sm text-gray-500 w-10 text-right">{pct}%</span>
                  </div>
                  {/* Bar */}
                  <div className="h-2 bg-black/10">
                    <div className={`h-full ${OPTION_BAR[i]} transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                  {/* Names (hidden by default) */}
                  {showNames && playerNames.length > 0 && (
                    <div className="px-4 py-2 flex flex-wrap gap-1.5 border-t border-black/10">
                      {playerNames.map(name => (
                        <span key={name} className="text-xs bg-white/60 px-2 py-0.5 rounded-full text-gray-700 font-medium">{name}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {unanswered.length > 0 && (
              <div className="rounded-2xl border-2 border-gray-700 bg-gray-800 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-1 font-bold text-gray-400">Niet geantwoord</span>
                  <span className="font-black text-xl text-gray-400">{unanswered.length}</span>
                </div>
                {showNames && (
                  <div className="px-4 py-2 flex flex-wrap gap-1.5 border-t border-gray-700">
                    {unanswered.map(p => (
                      <span key={p.id} className="text-xs bg-gray-700 px-2 py-0.5 rounded-full text-gray-300 font-medium">{p.nickname}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 flex items-center justify-between border-t border-gray-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNames(s => !s)}
            className={showNames ? 'bg-violet-500 text-white hover:bg-violet-400' : 'bg-violet-500/30 text-violet-300 border border-violet-500/50 hover:bg-violet-500/50'}
          >
            {showNames ? <><EyeOff size={16} /> Verberg namen</> : <><Eye size={16} /> Toon namen</>}
          </Button>
          <Button size="lg" onClick={goToLeaderboard} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold">
            <BarChart2 size={18} /> Leaderboard
          </Button>
        </div>
      </div>
    )
  }

  // Leaderboard between questions
  if (screen === 'leaderboard') return (
    <div className="min-h-screen bg-gradient-to-br from-violet-800 to-indigo-900 flex flex-col text-white">
      <div className="flex items-center justify-end px-6 py-3">
        <span className="text-xs bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-2 py-0.5 rounded-full font-bold tracking-wider">PIN {session.pin_code}</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
      <h2 className="text-3xl font-black">Top 5</h2>
      <div className="flex flex-col gap-3 w-full max-w-md">
        {topPlayers.map((p, i) => (
          <div key={p.id} className="bg-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl font-black text-yellow-400 w-8">{i + 1}</span>
            <Avatar avatar={p.avatar} size="sm" />
            <span className="flex-1 font-semibold text-lg">{p.nickname}</span>
            <span className="font-bold text-yellow-400">{p.total_score} pts</span>
          </div>
        ))}
      </div>
      <Button size="lg" onClick={nextQuestion} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold">
        <ChevronRight size={20} /> Volgende vraag
      </Button>
      </div>
    </div>
  )

  // Active question
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 bg-black/30">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Vraag {(session.current_question_index ?? 0) + 1} / {quiz.questions.length}</span>
          <span className="text-xs bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-2 py-0.5 rounded-full font-bold tracking-wider">PIN {session.pin_code}</span>
        </div>
        <div className="flex items-center gap-3">
          {timeLeft > 0 && (
            <span className={`flex items-center gap-1 font-bold text-lg ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
              <Timer size={18} /> {timeLeft}
            </span>
          )}
          <span className="text-sm text-gray-400">{currentResponses.length}/{players.length} geantwoord</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        {currentQ?.image_url && (
          <img
            src={currentQ.image_url}
            alt=""
            className={`rounded-2xl ${currentQ.question_type === 'pin' ? 'w-full max-w-2xl object-contain' : 'max-h-40 object-cover'}`}
          />
        )}
        <h2 className="text-3xl font-black text-center max-w-3xl">{currentQ?.question_text}</h2>

        {currentQ?.question_type !== 'pin' && (
          <div className={`grid gap-4 w-full max-w-3xl ${visibleOptions.length <= 2 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {visibleOptions.map((opt, i) => (
              <div key={opt.id} className={`${OPTION_COLORS[i]} rounded-2xl p-5 flex items-center gap-3`}>
                {opt.image_url && <img src={opt.image_url} alt="" className="w-16 h-16 rounded-lg object-contain bg-black/20" />}
                <span className="text-lg font-bold">{opt.option_text}</span>
              </div>
            ))}
          </div>
        )}
        {currentQ?.question_type === 'pin' && (
          <p className="text-gray-400 text-lg">Leerlingen plaatsen hun pin op de afbeelding...</p>
        )}
      </div>

      <div className="px-6 py-4 flex justify-center">
        <Button variant="secondary" size="lg" onClick={goToResults}>
          Toon resultaten <ChevronRight size={20} />
        </Button>
      </div>
    </div>
  )
}
