import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { GameSession, AvatarData } from '../../types/database'
import { DEFAULT_AVATAR } from '../../types/database'
import { AvatarPicker } from '../../components/game/AvatarPicker'
import { Avatar } from '../../components/game/Avatar'
import { Button } from '../../components/ui/Button'
import { Send } from 'lucide-react'

export default function SurveyPlay() {
  const { sessionId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { playerId, nickname } = (location.state ?? {}) as { playerId?: string; nickname?: string }

  const [session, setSession] = useState<GameSession | null>(null)
  const [avatar, setAvatar] = useState<AvatarData>(DEFAULT_AVATAR)
  const [avatarSaved, setAvatarSaved] = useState(false)
  const [inputText, setInputText] = useState('')
  const [answered, setAnswered] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!sessionId || !playerId) { navigate('/'); return }
    loadSession()

    const sub = supabase
      .channel(`survey-play-${sessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}`,
      }, payload => setSession(payload.new as GameSession))
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [sessionId, playerId])

  async function loadSession() {
    const { data } = await supabase.from('game_sessions').select('*').eq('id', sessionId).single()
    setSession(data)
  }

  async function saveAvatar(newAvatar: AvatarData) {
    setAvatar(newAvatar)
    setAvatarSaved(true)
    await supabase.from('players').update({ avatar: newAvatar }).eq('id', playerId)
  }

  async function submitAnswer() {
    if (!inputText.trim() || !playerId || !sessionId || submitting) return
    setSubmitting(true)
    await supabase.from('survey_responses').insert({
      session_id: sessionId,
      player_id: playerId,
      response_text: inputText.trim(),
    })
    setInputText('')
    setAnswered(true)
    setSubmitting(false)
  }

  if (!session) return (
    <div className="min-h-screen bg-violet-700 flex items-center justify-center text-white">Laden...</div>
  )

  // Finished
  if (session.status === 'finished') return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 to-indigo-700 flex flex-col items-center justify-center text-white gap-6 px-4">
      <Avatar avatar={avatar} size="lg" />
      <h2 className="text-2xl font-bold">Bevraging afgerond!</h2>
      <p className="text-violet-200">Bedankt voor je deelname, {nickname}.</p>
      <button onClick={() => navigate('/')} className="text-violet-200 hover:text-white transition text-sm cursor-pointer mt-4">
        Terug naar beginpagina
      </button>
    </div>
  )

  // Lobby: avatar picker + waiting
  if (session.status === 'lobby') return (
    <div className="min-h-screen bg-gradient-to-br from-violet-700 to-indigo-800 flex flex-col items-center px-4 py-8 text-white gap-5">
      <h2 className="text-2xl font-bold mt-4">Welkom, {nickname}!</h2>
      <p className="text-violet-300 text-sm">Kies jouw avatar en wacht op de leerkracht.</p>
      <AvatarPicker value={avatar} onChange={saveAvatar} />
      {avatarSaved && <p className="text-green-400 text-sm">✓ Avatar opgeslagen</p>}
      <div className="flex flex-col items-center gap-2 mt-2">
        <div className="w-6 h-6 border-4 border-violet-400 border-t-white rounded-full animate-spin" />
        <p className="text-violet-300 text-sm">Wachten op de leerkracht...</p>
      </div>
    </div>
  )

  // Active — answered
  if (answered) return (
    <div className="min-h-screen bg-gradient-to-br from-violet-700 to-indigo-800 flex flex-col items-center justify-center text-white gap-6 px-4">
      <Avatar avatar={avatar} size="md" />
      <div className="text-center">
        <p className="text-3xl font-black mb-2">Antwoord verstuurd!</p>
        <p className="text-violet-300">De leerkracht heeft jouw antwoord ontvangen.</p>
      </div>
      <Button
        size="lg"
        onClick={() => setAnswered(false)}
        className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold"
      >
        Nog een antwoord sturen
      </Button>
    </div>
  )

  // Active — text input
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-700 to-indigo-800 flex flex-col items-center justify-center text-white gap-6 px-4">
      <Avatar avatar={avatar} size="md" />
      <p className="text-xl font-bold">Typ jouw antwoord:</p>
      <div className="w-full max-w-md flex flex-col gap-4">
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitAnswer() }}
          placeholder="Schrijf hier jouw antwoord..."
          rows={4}
          className="w-full bg-white/20 border border-white/30 rounded-2xl px-4 py-3 text-white placeholder-violet-300 text-lg focus:outline-none focus:border-yellow-400 resize-none"
          autoFocus
        />
        <Button
          size="lg"
          onClick={submitAnswer}
          disabled={!inputText.trim() || submitting}
          className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold"
        >
          <Send size={18} /> {submitting ? 'Bezig...' : 'Stuur in'}
        </Button>
      </div>
    </div>
  )
}
