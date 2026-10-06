import { useEffect, useState, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { supabase } from '../../lib/supabase'
import type { AvatarData, GameSession, QuizWithQuestions, QuestionWithOptions, Option } from '../../types/database'
import { DEFAULT_AVATAR } from '../../types/database'
import { Timer, Check, X, MapPin, Send } from 'lucide-react'
import { Fireworks } from '../../components/game/Fireworks'
import { Avatar } from '../../components/game/Avatar'
import { AvatarPicker } from '../../components/game/AvatarPicker'

function pointInPolygon(px: number, py: number, polygon: {x: number; y: number}[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}

const OPTION_COLORS = [
  { bg: 'bg-red-500 hover:bg-red-600', active: 'ring-4 ring-red-300' },
  { bg: 'bg-blue-500 hover:bg-blue-600', active: 'ring-4 ring-blue-300' },
  { bg: 'bg-yellow-500 hover:bg-yellow-600', active: 'ring-4 ring-yellow-300' },
  { bg: 'bg-green-500 hover:bg-green-600', active: 'ring-4 ring-green-300' },
  { bg: 'bg-purple-500 hover:bg-purple-600', active: 'ring-4 ring-purple-300' },
  { bg: 'bg-pink-500 hover:bg-pink-600', active: 'ring-4 ring-pink-300' },
]

interface LocationState { playerId: string; nickname: string }

export default function StudentPlay() {
  const { sessionId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { playerId, nickname } = (location.state as LocationState) ?? {}

  const [avatar, setAvatar] = useState<AvatarData>(DEFAULT_AVATAR)
  const [session, setSession] = useState<GameSession | null>(null)
  const [quiz, setQuiz] = useState<QuizWithQuestions | null>(null)
  const [currentQ, setCurrentQ] = useState<QuestionWithOptions | null>(null)
  const [shuffledOptions, setShuffledOptions] = useState<Option[]>([])
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [dragOrder, setDragOrder] = useState<Option[]>([])
  const [answered, setAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [totalScore, setTotalScore] = useState(0)
  const [finished, setFinished] = useState(false)
  const [ranking, setRanking] = useState<number | null>(null)
  // Brainstorm
  const [brainstormInput, setBrainstormInput] = useState('')
  const [brainstormCount, setBrainstormCount] = useState(0)
  const [brainstormFlash, setBrainstormFlash] = useState(false)
  // Pin
  const [pinPos, setPinPos] = useState<{x: number; y: number} | null>(null)
  const pinContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sessionId || !playerId) { navigate('/'); return }
    loadData()
  }, [sessionId])

  async function loadData() {
    const { data: sess } = await supabase.from('game_sessions').select('*').eq('id', sessionId).single()
    setSession(sess)

    if (sess) {
      const { data: q } = await supabase
        .from('quizzes')
        .select('*, questions(*, options(*))')
        .eq('id', sess.quiz_id)
        .single()
      if (q) {
        let questions = q.questions.sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
        if (sess.question_order?.length > 0) {
          questions = sess.question_order
            .map((id: string) => questions.find((question: { id: string }) => question.id === id))
            .filter(Boolean)
        }
        const sorted = { ...q, questions }
        setQuiz(sorted as QuizWithQuestions)
        updateCurrentQuestion(sorted as QuizWithQuestions, sess)
      }
    }

    // Listen for session changes (live mode)
    const sub = supabase
      .channel(`session-${sessionId}-state`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
        payload => {
          const updated = payload.new as GameSession
          setSession(updated)
        })
      .subscribe()

    return () => supabase.removeChannel(sub)
  }

  useEffect(() => {
    if (session && quiz) updateCurrentQuestion(quiz, session)
  }, [session?.current_question_index, session?.status])

  async function fetchRanking(sessionId: string, myId: string) {
    const { data } = await supabase.from('players').select('id, total_score').eq('session_id', sessionId).order('total_score', { ascending: false })
    if (data) {
      const pos = data.findIndex(p => p.id === myId) + 1
      setRanking(pos)
    }
  }

  function updateCurrentQuestion(q: QuizWithQuestions, sess: GameSession) {
    if (sess.status === 'finished') {
      setFinished(true)
      if (sessionId && playerId) fetchRanking(sessionId, playerId)
      return
    }
    if (sess.status !== 'active') return
    // Apply question_order so host and student always show the same question
    let orderedQuestions = q.questions
    if (sess.question_order?.length > 0) {
      const reordered = (sess.question_order as string[])
        .map(id => orderedQuestions.find(qx => qx.id === id))
        .filter(Boolean) as QuestionWithOptions[]
      if (reordered.length > 0) orderedQuestions = reordered
    }
    const question = orderedQuestions[sess.current_question_index]
    // Preload images so they appear immediately
    const urls = [question.image_url, ...question.options.map(o => o.image_url)].filter(Boolean) as string[]
    urls.forEach(url => { const img = new Image(); img.src = url })
    setCurrentQ(question)
    setSelectedOption(null)
    setAnswered(false)
    setIsCorrect(null)
    setBrainstormInput(''); setBrainstormCount(0)
    setPinPos(null)
    // Shuffle options so correct answer isn't always first
    const shuffled = [...question.options].sort(() => Math.random() - 0.5)
    setShuffledOptions(shuffled)
    setDragOrder([...question.options].sort(() => Math.random() - 0.5))
    if (question.time_limit > 0) {
      setTimeLeft(question.time_limit)
      setStartTime(Date.now())
    }
  }

  useEffect(() => {
    if (answered || timeLeft <= 0) return
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { handleTimeout(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [answered, timeLeft])

  async function handleBrainstormSubmit() {
    if (!brainstormInput.trim() || !currentQ || !sessionId || !playerId) return
    await supabase.from('responses').insert({
      session_id: sessionId, player_id: playerId, question_id: currentQ.id,
      response_text: brainstormInput.trim(), is_correct: false, points_awarded: 0, response_time: 0,
    })
    setBrainstormCount(c => c + 1)
    setBrainstormInput('')
    setBrainstormFlash(true)
    setTimeout(() => setBrainstormFlash(false), 1500)
  }

  async function handlePinSubmit() {
    if (!pinPos || !currentQ || answered || !sessionId || !playerId) return
    setAnswered(true)
    const zone = currentQ.zone_polygon ?? []
    const correct = pointInPolygon(pinPos.x, pinPos.y, zone)
    setIsCorrect(correct)
    const elapsed = (Date.now() - startTime) / 1000
    let points = 0
    if (correct && currentQ.points_enabled) {
      const base = currentQ.points_value ?? 1000
      const speedBonus = currentQ.time_limit > 0 ? Math.floor((1 - elapsed / currentQ.time_limit) * (base * 0.5)) : 0
      points = base + Math.max(0, speedBonus)
    }
    setTotalScore(s => s + points)
    await supabase.from('responses').insert({
      session_id: sessionId, player_id: playerId, question_id: currentQ.id,
      response_x: pinPos.x, response_y: pinPos.y,
      is_correct: correct, points_awarded: points, response_time: Math.round(elapsed),
    })
    await supabase.from('players').update({ total_score: totalScore + points }).eq('id', playerId)
  }

  async function handleTimeout() {
    if (answered || !currentQ) return
    setAnswered(true)
    setIsCorrect(false)
    await submitResponse(null, false, 0)
  }

  async function handleAnswer(optionId: string) {
    if (answered || !currentQ) return
    setSelectedOption(optionId)
    setAnswered(true)

    const option = currentQ.options.find(o => o.id === optionId)
    const correct = option?.is_correct ?? false
    setIsCorrect(correct)

    const elapsed = (Date.now() - startTime) / 1000
    let points = 0
    if (correct && currentQ.points_enabled) {
      const base = currentQ.points_value ?? 1000
      const speedBonus = currentQ.time_limit > 0 ? Math.floor((1 - elapsed / currentQ.time_limit) * (base * 0.5)) : 0
      points = base + Math.max(0, speedBonus)
    }

    setTotalScore(s => s + points)
    await submitResponse(optionId, correct, points)
    await supabase.from('players').update({ total_score: totalScore + points }).eq('id', playerId)
  }

  async function handleDragSubmit() {
    if (answered || !currentQ) return
    setAnswered(true)

    const correct = dragOrder.every((opt, i) => {
      const expected = currentQ.options.find(o => o.correct_order === i)
      return expected?.id === opt.id
    })
    setIsCorrect(correct)

    const elapsed = (Date.now() - startTime) / 1000
    let points = 0
    if (correct && currentQ.points_enabled) {
      const base = currentQ.points_value ?? 1000
      const speedBonus = currentQ.time_limit > 0 ? Math.floor((1 - elapsed / currentQ.time_limit) * (base * 0.5)) : 0
      points = base + Math.max(0, speedBonus)
    }
    setTotalScore(s => s + points)
    const orderText = JSON.stringify(dragOrder.map(o => o.id))
    await submitResponse(null, correct, points, orderText)
    await supabase.from('players').update({ total_score: totalScore + points }).eq('id', playerId)
  }

  async function submitResponse(optionId: string | null, correct: boolean, points: number, responseText?: string) {
    if (!currentQ || !sessionId || !playerId) return
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    await supabase.from('responses').insert({
      session_id: sessionId,
      player_id: playerId,
      question_id: currentQ.id,
      option_id: optionId,
      is_correct: correct,
      points_awarded: points,
      response_time: elapsed,
      response_text: responseText ?? null,
    })
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const items = Array.from(dragOrder)
    const [moved] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, moved)
    setDragOrder(items)
  }

  async function handleAvatarChange(newAvatar: AvatarData) {
    setAvatar(newAvatar)
    if (playerId) {
      await supabase.from('players').update({ avatar: newAvatar }).eq('id', playerId)
    }
  }

  // Waiting for host — avatar customiser
  if (session?.status === 'lobby') return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 to-indigo-700 flex flex-col text-white">
      <div className="flex items-center justify-between px-5 py-4 bg-black/20">
        <span className="font-bold text-lg">{nickname}</span>
        <div className="flex items-center gap-2 text-violet-300 text-sm">
          <span>Wachten op leerkracht</span>
          <div className="flex gap-0.5">
            {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-violet-300 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col items-center px-5 py-6 gap-2">
        <p className="text-violet-200 text-sm mb-2">Maak jouw avatar aan terwijl je wacht!</p>
        <AvatarPicker value={avatar} onChange={handleAvatarChange} />
      </div>
    </div>
  )

  if (finished) return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 to-indigo-700 flex flex-col items-center justify-center text-white gap-6 px-4">
      <Fireworks />
      <Avatar avatar={avatar} size="lg" />
      <h2 className="text-2xl font-bold">Quiz afgerond, {nickname}!</h2>
      {ranking !== null && (
        <div className="flex flex-col items-center">
          <p className="text-violet-300 text-sm uppercase tracking-widest mb-1">Eindpositie</p>
          <div className="bg-yellow-400 text-gray-900 rounded-3xl px-12 py-5 text-center shadow-2xl">
            <p className="text-8xl font-black leading-none">#{ranking}</p>
          </div>
        </div>
      )}
      <div className="bg-white/20 rounded-2xl px-10 py-4 text-center">
        <p className="text-violet-200 text-sm mb-1">Jouw score</p>
        <p className="text-4xl font-black text-yellow-400">{totalScore} <span className="text-xl font-normal text-violet-200">pts</span></p>
      </div>
      <button onClick={() => navigate('/')} className="text-violet-200 hover:text-white transition text-sm cursor-pointer">
        Terug naar beginpagina
      </button>
    </div>
  )

  if (!currentQ) return (
    <div className="min-h-screen bg-violet-700 flex items-center justify-center text-white">Laden...</div>
  )

  const needsReveal = currentQ.question_type !== 'brainstorm' && currentQ.question_type !== 'pin'

  // Waiting for teacher to reveal results
  if (answered && needsReveal && !session?.answer_visible) return (
    <div className="min-h-screen bg-violet-800 flex flex-col items-center justify-center text-white gap-6 px-4">
      <Avatar avatar={avatar} size="md" />
      <p className="text-xl font-bold">Antwoord verstuurd!</p>
      <p className="text-violet-300">Wachten op de resultaten...</p>
      <div className="flex gap-2">
        {[0,1,2].map(i => (
          <div key={i} className="w-3 h-3 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  )

  // Feedback screen after reveal
  if (answered && needsReveal && session?.answer_visible) {
    const correctOption = shuffledOptions.find(o => o.is_correct) ?? currentQ.options.find(o => o.is_correct)
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center text-white gap-5 px-4 ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
        {isCorrect && <Fireworks />}
        <Avatar avatar={avatar} size="lg" />
        <div className="text-7xl">{isCorrect ? '✅' : '❌'}</div>
        <h2 className="text-4xl font-black">{isCorrect ? 'Juist! 🎉' : 'Fout!'}</h2>
        {!isCorrect && correctOption && (
          <div className="bg-white/20 rounded-2xl px-6 py-4 text-center max-w-sm">
            <p className="text-white/80 text-sm mb-2">Het juiste antwoord was:</p>
            {correctOption.image_url && (
              <img src={correctOption.image_url} alt="" className="w-24 h-24 rounded-xl object-contain mx-auto mb-2 bg-white/10" />
            )}
            {correctOption.option_text && <p className="text-xl font-bold">{correctOption.option_text}</p>}
          </div>
        )}
        {!session?.hide_scores && (
          <div className="bg-white/20 rounded-2xl px-8 py-4 text-center">
            <p className="text-white/80 text-sm mb-1">Jouw score</p>
            <p className="text-4xl font-black">{totalScore}</p>
          </div>
        )}
      </div>
    )
  }

  const mcOptions = shuffledOptions.filter(o => o.option_text?.trim())

  // Brainstorm screen
  if (currentQ.question_type === 'brainstorm') return (
    <div className="min-h-screen bg-gradient-to-br from-violet-700 to-indigo-800 text-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-violet-300">Hoi {nickname}!</span>
        {!session?.hide_scores && <span className="text-sm text-violet-300">{totalScore} pts</span>}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        {currentQ.image_url && <img src={currentQ.image_url} alt="" className="max-h-32 rounded-xl object-contain" />}
        <h2 className="text-2xl font-bold text-center max-w-lg">{currentQ.question_text}</h2>

        <div className="w-full max-w-sm flex flex-col gap-3">
          {brainstormFlash && (
            <div className="bg-green-500 rounded-xl px-4 py-2 text-center font-bold animate-pulse">
              ✓ Antwoord verstuurd!
            </div>
          )}
          {brainstormCount > 0 && !brainstormFlash && (
            <p className="text-violet-300 text-sm text-center">{brainstormCount} antwoord{brainstormCount !== 1 ? 'en' : ''} verstuurd</p>
          )}
          <textarea
            value={brainstormInput}
            onChange={e => setBrainstormInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleBrainstormSubmit() } }}
            placeholder="Typ hier je antwoord..."
            rows={3}
            className="w-full rounded-2xl px-4 py-3 text-gray-900 text-base resize-none outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <button
            onClick={handleBrainstormSubmit}
            disabled={!brainstormInput.trim()}
            className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-gray-900 font-bold rounded-2xl py-3 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Send size={18} /> Verstuur
          </button>
          <p className="text-xs text-violet-300 text-center">Je kan meerdere antwoorden insturen. Druk op Enter of de knop.</p>
        </div>
      </div>
    </div>
  )

  // Pin screen
  if (currentQ.question_type === 'pin') return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {currentQ.time_limit > 0 && (
        <div className="h-1.5 bg-gray-700">
          <div className="h-full bg-yellow-400 transition-all duration-1000" style={{ width: `${(timeLeft / currentQ.time_limit) * 100}%` }} />
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-gray-400">Hoi {nickname}!</span>
        {timeLeft > 0 && (
          <span className={`flex items-center gap-1 font-bold ${timeLeft <= 5 ? 'text-red-400' : 'text-yellow-400'}`}>
            <Timer size={16} /> {timeLeft}s
          </span>
        )}
        {!session?.hide_scores && <span className="text-sm text-violet-300">{totalScore} pts</span>}
      </div>

      {answered && session?.answer_visible && (
        <div className={`mx-4 mt-1 rounded-2xl p-3 flex items-center gap-3 ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
          {isCorrect ? <Check size={20} /> : <X size={20} />}
          <span className="font-bold">{isCorrect ? 'Juiste plek! 🎉' : 'Niet de juiste plek'}</span>
        </div>
      )}
      {answered && !session?.answer_visible && (
        <div className="mx-4 mt-1 rounded-2xl p-3 bg-violet-700/60 flex items-center gap-2 text-violet-200 text-sm">
          <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
          Wachten op resultaat...
        </div>
      )}

      <div className="flex-1 flex flex-col items-center px-4 py-3 gap-4">
        <h2 className="text-lg font-bold text-center">{currentQ.question_text}</h2>

        {currentQ.image_url ? (
          <div
            ref={pinContainerRef}
            className={`relative w-full max-w-lg ${!answered ? 'cursor-crosshair' : ''}`}
            style={{ userSelect: 'none' }}
            onClick={e => {
              if (answered || !pinContainerRef.current) return
              const rect = pinContainerRef.current.getBoundingClientRect()
              setPinPos({
                x: Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10,
                y: Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10,
              })
            }}
          >
            <img src={currentQ.image_url} alt="" className="w-full rounded-2xl block" draggable={false} style={{ pointerEvents: 'none' }} />
            {pinPos && (
              <div
                className="absolute -translate-x-1/2 -translate-y-full pointer-events-none"
                style={{ left: `${pinPos.x}%`, top: `${pinPos.y}%` }}
              >
                <MapPin size={32} className={`drop-shadow-lg ${answered ? (isCorrect ? 'text-green-400' : 'text-red-400') : 'text-yellow-400'}`} fill="currentColor" />
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-2xl p-8 text-gray-400">Geen afbeelding</div>
        )}

        {!answered && (
          <button
            onClick={handlePinSubmit}
            disabled={!pinPos}
            className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-gray-900 font-bold rounded-2xl py-3 px-8 transition cursor-pointer flex items-center gap-2"
          >
            <MapPin size={18} /> Bevestig mijn keuze
          </button>
        )}
        {!pinPos && !answered && (
          <p className="text-sm text-gray-500">Klik op de afbeelding om een pin te plaatsen</p>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Timer bar */}
      {currentQ.time_limit > 0 && (
        <div className="h-1.5 bg-gray-700">
          <div
            className="h-full bg-yellow-400 transition-all duration-1000"
            style={{ width: `${(timeLeft / currentQ.time_limit) * 100}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-gray-400">Hoi {nickname}!</span>
        {timeLeft > 0 && (
          <span className={`flex items-center gap-1 font-bold ${timeLeft <= 5 ? 'text-red-400' : 'text-yellow-400'}`}>
            <Timer size={16} /> {timeLeft}s
          </span>
        )}
        {!session?.hide_scores && <span className="text-sm text-violet-300">{totalScore} pts</span>}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-6">
        {currentQ.image_url && (
          <img src={currentQ.image_url} alt="" className="max-h-32 rounded-xl object-cover" />
        )}
        <h2 className="text-xl font-bold text-center max-w-lg">{currentQ.question_text}</h2>

        {currentQ.question_type === 'drag_order' ? (
          <div className="w-full max-w-sm">
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="drag-options">
                {provided => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-2">
                    {dragOrder.map((opt, i) => (
                      <Draggable key={opt.id} draggableId={opt.id} index={i} isDragDisabled={answered}>
                        {prov => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            className="bg-violet-600 rounded-xl px-4 py-3 font-medium flex items-center gap-3"
                          >
                            <span className="text-violet-300 text-sm w-6 text-center">{i + 1}</span>
                            {opt.option_text}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            {!answered && (
              <button
                onClick={handleDragSubmit}
                className="mt-4 w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold rounded-xl py-3 transition cursor-pointer"
              >
                Bevestigen
              </button>
            )}
          </div>
        ) : currentQ.question_type === 'select_image' ? (
          <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
            {shuffledOptions.filter(o => o.image_url || o.option_text?.trim()).map((opt, i) => (
              <button
                key={opt.id}
                disabled={answered}
                onClick={() => handleAnswer(opt.id)}
                className={`${OPTION_COLORS[i].bg} rounded-2xl p-4 flex flex-col items-center gap-2 transition cursor-pointer disabled:cursor-default ${selectedOption === opt.id ? OPTION_COLORS[i].active : ''}`}
              >
                {opt.image_url && <img src={opt.image_url} alt="" className="w-full h-36 rounded-xl object-contain bg-black/20" />}
                <span className="font-bold">{opt.option_text}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className={`grid gap-3 w-full max-w-lg ${mcOptions.length <= 2 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {mcOptions.map((opt, i) => (
              <button
                key={opt.id}
                disabled={answered}
                onClick={() => handleAnswer(opt.id)}
                className={`${OPTION_COLORS[i].bg} rounded-2xl px-5 py-7 text-center text-xl font-bold transition cursor-pointer disabled:cursor-default min-h-[90px] ${selectedOption === opt.id ? OPTION_COLORS[i].active : ''}`}
              >
                {opt.option_text}
              </button>
            ))}
          </div>
        )}

        {!answered && currentQ.question_type !== 'drag_order' && (
          <p className="text-gray-500 text-sm">Kies je antwoord</p>
        )}
      </div>
    </div>
  )
}
