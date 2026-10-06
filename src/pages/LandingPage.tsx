import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { BookOpen, LogIn, UserPlus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function LandingPage() {
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [showRequest, setShowRequest] = useState(false)
  const [reqEmail, setReqEmail] = useState('')
  const [reqMessage, setReqMessage] = useState('')
  const [reqLoading, setReqLoading] = useState(false)
  const [reqDone, setReqDone] = useState(false)
  const [reqError, setReqError] = useState('')

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    if (!pin.trim() || !nickname.trim()) return
    setError('')
    setLoading(true)

    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .select('id, status, is_active, session_type')
      .eq('pin_code', pin.trim())
      .eq('is_active', true)
      .single()

    if (sessionError || !session) {
      setError('Geen actieve sessie gevonden met deze PIN.')
      setLoading(false)
      return
    }

    if (session.status === 'finished') {
      setError('Deze sessie is al afgelopen.')
      setLoading(false)
      return
    }

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

    const state = { playerId: player.id, nickname: nickname.trim() }
    if (session.session_type === 'survey') {
      navigate(`/survey/${session.id}/play`, { state })
    } else {
      navigate(`/game/${session.id}/play`, { state })
    }
  }

  async function handleRequest(e: FormEvent) {
    e.preventDefault()
    if (!reqEmail.trim()) return
    setReqError('')
    setReqLoading(true)
    const { error } = await supabase.from('access_requests').insert({
      email: reqEmail.trim().toLowerCase(),
      message: reqMessage.trim() || null,
    })
    setReqLoading(false)
    if (error) {
      setReqError('Er is iets misgegaan. Probeer het opnieuw.')
    } else {
      setReqDone(true)
    }
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

      {/* Teacher actions */}
      <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-semibold px-5 py-2.5 rounded-2xl transition cursor-pointer border border-white/20"
        >
          <LogIn size={18} />
          Inloggen als leerkracht
        </button>
        <button
          onClick={() => setShowRequest(true)}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-violet-200 hover:text-white px-5 py-2.5 rounded-2xl transition cursor-pointer border border-white/10 text-sm"
        >
          <UserPlus size={16} />
          Vraag toegang aan
        </button>
      </div>

      {/* Access request modal */}
      {showRequest && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md relative">
            <button
              onClick={() => { setShowRequest(false); setReqDone(false); setReqEmail(''); setReqMessage(''); setReqError('') }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X size={20} />
            </button>

            {reqDone ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-4">✅</div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Aanvraag verstuurd!</h2>
                <p className="text-gray-500 text-sm">
                  De beheerder bekijkt jouw aanvraag en stuurt je een uitnodigingsmail zodra je toegang hebt.
                </p>
                <button
                  onClick={() => { setShowRequest(false); setReqDone(false); setReqEmail(''); setReqMessage('') }}
                  className="mt-6 text-violet-600 hover:text-violet-800 text-sm font-medium cursor-pointer"
                >
                  Sluiten
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-1">Toegang aanvragen</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Laat je e-mailadres achter. De beheerder maakt jouw account aan en je ontvangt een uitnodigingsmail om je wachtwoord in te stellen.
                </p>
                <form onSubmit={handleRequest} className="flex flex-col gap-4">
                  <Input
                    label="E-mailadres"
                    type="email"
                    value={reqEmail}
                    onChange={e => setReqEmail(e.target.value)}
                    placeholder="naam@school.be"
                    required
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Bericht (optioneel)</label>
                    <textarea
                      value={reqMessage}
                      onChange={e => setReqMessage(e.target.value)}
                      placeholder="Voeg eventueel een kort berichtje toe..."
                      rows={3}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                    />
                  </div>
                  {reqError && <p className="text-sm text-red-500">{reqError}</p>}
                  <Button type="submit" disabled={reqLoading || !reqEmail.trim()}>
                    {reqLoading ? 'Bezig...' : 'Aanvraag versturen'}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
