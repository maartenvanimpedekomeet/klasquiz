import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { GameSession, Player, SurveyResponse } from '../../types/database'
import { Button } from '../../components/ui/Button'
import { Users, Eye, EyeOff, Trash2, UserCheck, UserX } from 'lucide-react'
import { Avatar } from '../../components/game/Avatar'

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

export default function SurveyHost() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<GameSession | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [responses, setResponses] = useState<SurveyResponse[]>([])
  const [anonymous, setAnonymous] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    loadData()

    const playerSub = supabase
      .channel(`survey-host-${sessionId}-players`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` },
        payload => setPlayers(p => [...p, payload.new as Player]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` },
        payload => setPlayers(p => p.map(x => x.id === (payload.new as Player).id ? payload.new as Player : x)))
      .subscribe()

    const responseSub = supabase
      .channel(`survey-host-${sessionId}-responses`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'survey_responses', filter: `session_id=eq.${sessionId}` },
        payload => setResponses(p => [...p, payload.new as SurveyResponse]))
      .subscribe()

    return () => {
      supabase.removeChannel(playerSub)
      supabase.removeChannel(responseSub)
    }
  }, [sessionId])

  async function loadData() {
    const { data: sess } = await supabase.from('game_sessions').select('*').eq('id', sessionId).single()
    if (sess) {
      setSession(sess)
      setAnonymous(sess.anonymous)
    }
    const { data: ps } = await supabase.from('players').select('*').eq('session_id', sessionId)
    setPlayers(ps ?? [])
    const { data: rs } = await supabase.from('survey_responses').select('*').eq('session_id', sessionId).order('created_at')
    setResponses(rs ?? [])
  }

  async function startSurvey() {
    await supabase.from('game_sessions').update({
      status: 'active', answer_visible: false, anonymous,
    }).eq('id', sessionId)
    setSession(s => s ? { ...s, status: 'active', answer_visible: false, anonymous } : s)
  }

  async function toggleAnswersVisible() {
    const newVal = !session?.answer_visible
    await supabase.from('game_sessions').update({ answer_visible: newVal }).eq('id', sessionId)
    setSession(s => s ? { ...s, answer_visible: newVal } : s)
  }

  async function toggleAnonymous() {
    const newVal = !session?.anonymous
    await supabase.from('game_sessions').update({ anonymous: newVal }).eq('id', sessionId)
    setSession(s => s ? { ...s, anonymous: newVal } : s)
  }

  async function clearResponses() {
    await supabase.from('survey_responses').delete().eq('session_id', sessionId)
    setResponses([])
    if (session?.answer_visible) {
      await supabase.from('game_sessions').update({ answer_visible: false }).eq('id', sessionId)
      setSession(s => s ? { ...s, answer_visible: false } : s)
    }
  }

  async function endSurvey() {
    await supabase.from('game_sessions').update({ status: 'finished', is_active: false }).eq('id', sessionId)
    navigate('/teacher')
  }

  if (!session) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Laden...</div>
  )

  // Lobby
  if (session.status === 'lobby') return (
    <div className="min-h-screen bg-gradient-to-br from-violet-800 to-indigo-900 flex flex-col items-center justify-center text-white gap-8">
      <h1 className="text-3xl font-black">Bevraging</h1>
      <div className="flex items-center gap-8 flex-wrap justify-center">
        <div className="text-center">
          <p className="text-violet-300 text-sm uppercase tracking-wider mb-3">
            Surf naar <span className="text-white font-bold">tinyurl.com/klasquiz</span>
          </p>
          <div className="border-4 border-yellow-400 rounded-3xl px-10 py-5 inline-block">
            <p className="text-yellow-400 text-xs uppercase tracking-widest font-bold mb-1">SPELPIN</p>
            <p className="text-8xl font-black tracking-widest text-yellow-400">{session.pin_code}</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <img src="/qr-klasquiz.png" alt="QR code tinyurl.com/klasquiz" className="w-36 h-36 rounded-2xl bg-white p-2" />
          <p className="text-violet-300 text-xs">Scan om deel te nemen</p>
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
      <Toggle active={anonymous} onClick={() => setAnonymous(v => !v)} label="Anoniem spelen (geen namen tonen)" />
      <Button
        size="lg"
        onClick={startSurvey}
        disabled={players.length === 0}
        className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold text-lg px-10"
      >
        Start bevraging!
      </Button>
    </div>
  )

  // Finished
  if (session.status === 'finished') return (
    <div className="min-h-screen bg-gradient-to-br from-violet-800 to-indigo-900 flex flex-col items-center justify-center text-white gap-6">
      <h1 className="text-3xl font-black">Bevraging afgerond</h1>
      <Button variant="secondary" onClick={() => navigate('/teacher')} size="lg">
        Terug naar dashboard
      </Button>
    </div>
  )

  // Active
  const respondedIds = new Set(responses.map(r => r.player_id))
  const showAnon = session.anonymous

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/30">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Bevraging</span>
          <span className="text-xs bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-2 py-0.5 rounded-full font-bold tracking-wider">
            PIN {session.pin_code}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleAnonymous}
            title={showAnon ? 'Anoniem aan' : 'Anoniem uit'}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition cursor-pointer ${
              showAnon
                ? 'bg-violet-500/30 text-violet-300 border-violet-500/50 hover:bg-violet-500/50'
                : 'bg-white/10 text-gray-400 border-white/20 hover:bg-white/20'
            }`}
          >
            {showAnon ? <UserX size={12} /> : <UserCheck size={12} />}
            {showAnon ? 'Anoniem' : 'Met namen'}
          </button>
          <span className="text-sm font-bold text-yellow-400">
            {responses.length} / {players.length}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center px-6 py-6 gap-6 overflow-y-auto">

        {/* Answer count */}
        <div className="bg-white/10 rounded-2xl px-8 py-4 flex items-center gap-4 w-full max-w-2xl">
          <span className="text-5xl font-black text-yellow-400">{responses.length}</span>
          <div>
            <p className="text-lg font-bold">antwoord{responses.length !== 1 ? 'en' : ''} ontvangen</p>
            <p className="text-sm text-gray-400">van {players.length} speler{players.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Who answered (always visible) */}
        {!session.answer_visible && (
          <div className="w-full max-w-2xl">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-bold">Status spelers</p>
            <div className="flex flex-wrap gap-2">
              {players.map(p => {
                const hasAnswered = respondedIds.has(p.id)
                return (
                  <div key={p.id} className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-sm font-medium transition-all ${
                    hasAnswered ? 'bg-green-500/25 text-green-300' : 'bg-white/8 text-gray-500'
                  }`}>
                    <Avatar avatar={p.avatar} size="xs" />
                    <span>{p.nickname}</span>
                    {hasAnswered && <span className="text-green-400 text-xs">✓</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Answers (when visible) */}
        {session.answer_visible && (
          <div className="w-full max-w-2xl flex flex-col gap-3">
            {responses.length === 0 ? (
              <p className="text-gray-500 text-center">Nog geen antwoorden.</p>
            ) : (
              responses.map(r => {
                const player = players.find(p => p.id === r.player_id)
                return (
                  <div key={r.id} className="bg-white/10 rounded-2xl px-5 py-4 flex items-start gap-3">
                    {!showAnon && player && <Avatar avatar={player.avatar} size="xs" />}
                    <div className="flex-1">
                      {!showAnon && (
                        <p className="text-xs text-violet-300 font-bold mb-1">{player?.nickname ?? '?'}</p>
                      )}
                      <p className="text-lg font-medium leading-snug">{r.response_text}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 flex items-center justify-between border-t border-gray-800 gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={endSurvey}
          className="text-gray-500 hover:text-gray-300"
        >
          Stoppen
        </Button>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearResponses}
            disabled={responses.length === 0}
            className="text-red-400 border border-red-500/30 hover:bg-red-500/10 disabled:opacity-30"
          >
            <Trash2 size={16} /> Wis antwoorden
          </Button>
          <Button
            size="lg"
            onClick={toggleAnswersVisible}
            className={session.answer_visible
              ? 'bg-violet-500/30 text-violet-300 border border-violet-500/50 hover:bg-violet-500/50'
              : 'bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold'}
          >
            {session.answer_visible
              ? <><EyeOff size={18} /> Verberg antwoorden</>
              : <><Eye size={18} /> Toon antwoorden</>
            }
          </Button>
        </div>
      </div>
    </div>
  )
}
