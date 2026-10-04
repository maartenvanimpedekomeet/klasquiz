import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { BookOpen } from 'lucide-react'

export default function LoginPage() {
  const { signIn, profile } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError('Ongeldig e-mailadres of wachtwoord.')
      return
    }
    // Navigate based on role after profile loads — handled by router
  }

  // If already logged in, redirect
  if (profile) {
    navigate(profile.role === 'admin' ? '/admin' : '/teacher')
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-violet-600 text-white p-3 rounded-2xl mb-4">
            <BookOpen size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Klasquiz</h1>
          <p className="text-gray-500 text-sm mt-1">Inloggen voor leerkrachten</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="E-mailadres"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="naam@school.be"
            required
          />
          <Input
            label="Wachtwoord"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button type="submit" size="lg" disabled={loading} className="mt-2">
            {loading ? 'Bezig...' : 'Inloggen'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
