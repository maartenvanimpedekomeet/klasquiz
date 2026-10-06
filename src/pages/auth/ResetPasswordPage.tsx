import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { BookOpen } from 'lucide-react'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  // Capture the URL hash before Supabase clears it
  const isFromLink = useRef(
    window.location.hash.includes('type=invite') ||
    window.location.hash.includes('type=recovery') ||
    window.location.search.includes('type=invite') ||
    window.location.search.includes('type=recovery')
  )

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY: via "wachtwoord vergeten" / reset link
      // SIGNED_IN / INITIAL_SESSION: via uitnodigingslink (invite)
      // INITIAL_SESSION fires immediately on subscribe with the already-processed session
      const hasSession = !!session
      if (
        event === 'PASSWORD_RECOVERY' ||
        ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && isFromLink.current && hasSession)
      ) {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Wachtwoorden komen niet overeen.'); return }
    if (password.length < 6) { setError('Wachtwoord moet minstens 6 tekens bevatten.'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError(err.message); return }
    navigate('/teacher')
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
      </div>

      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Nieuw wachtwoord instellen</h2>

        {!ready ? (
          <p className="text-gray-500 text-center">Bezig met verifiëren…</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Nieuw wachtwoord"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimaal 6 tekens"
            />
            <Input
              label="Herhaal wachtwoord"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Zelfde wachtwoord"
            />
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? 'Bezig…' : 'Wachtwoord opslaan'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
