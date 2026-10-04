import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { BookOpen, LogIn } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function LandingPage() {
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    if (!pin.trim() || !nickname.trim()) return
    setError('')
    setLoading(true)

    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .select('id, status, is_active')
      .eq('pin_code', pin.trim())
      .eq('is_active', true)
      .single()

    if (sessionError || !session) {
      setError('Geen actieve quiz gevonden met deze PIN.')
      setLoading(false)
      return
    }

    if (session.status === 'finished') {
      setError('Deze quiz is al afgelopen.')
      setLoading(false)
      return
    }

    // Create player record
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ session_id: session.id, nickname: nickname.trim(), total_score: 0 })
      .select()
      .single()

    setLoading(false)
    if (playerError || !player) {
      setError('Kon niet deelnemen. Probeer een andere bijnaam.')
      return
    }

    navigate(`/game/${session.id}/play`, { state: { playerId: player.id, nickname: nickname.trim() } })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 to-indigo-700 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="bg-white/20 p-3 rounded-2xl">
            <BookOpen size={32} className="text-white" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tight">Klasquiz</h1>
        </div>
        <p className="text-violet-200 text-lg">Doe mee aan een quiz met je klas!</p>
      </div>

      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <Input
            label="Spel-PIN"
            type="text"
            value={pin}
            onChange={e => setPin(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
            placeholder="ABCD"
            className="text-center text-2xl font-bold tracking-widest"
            maxLength={4}
          />
          <Input
            label="Bijnaam"
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value.slice(0, 20))}
            placeholder="Jouw naam"
            maxLength={20}
          />
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button type="submit" size="lg" disabled={loading || pin.length < 4 || nickname.length < 1}>
            {loading ? 'Bezig...' : 'Deelnemen!'}
          </Button>
        </form>
      </div>

      <button
        onClick={() => navigate('/login')}
        className="mt-8 flex items-center gap-2 text-violet-200 hover:text-white transition text-sm cursor-pointer"
      >
        <LogIn size={16} />
        Inloggen als leerkracht
      </button>
    </div>
  )
}
