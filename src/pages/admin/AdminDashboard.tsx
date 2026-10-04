import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types/database'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { BookOpen, LogOut, Plus, Trash2, UserCog } from 'lucide-react'

export default function AdminDashboard() {
  const { profile, signOut } = useAuth()
  const [teachers, setTeachers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  useEffect(() => { fetchTeachers() }, [])

  async function fetchTeachers() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'teacher')
      .order('created_at')
    setTeachers(data ?? [])
    setLoading(false)
  }

  async function createTeacher() {
    if (!newEmail || !newPassword) return
    setAddError('')
    setAddLoading(true)

    // Use Supabase admin API via edge function or service role
    // For now, use a signUp call (self-signup disabled in prod via auth settings)
    const { data, error } = await supabase.auth.signUp({
      email: newEmail,
      password: newPassword,
      options: { data: { role: 'teacher' } },
    })

    if (error || !data.user) {
      setAddError(error?.message ?? 'Kon leerkracht niet aanmaken.')
      setAddLoading(false)
      return
    }

    // Profile is created via DB trigger, but we insert manually as fallback
    await supabase.from('profiles').upsert({
      user_id: data.user.id,
      email: newEmail,
      role: 'teacher',
    })

    setNewEmail('')
    setNewPassword('')
    setShowAddForm(false)
    setAddLoading(false)
    fetchTeachers()
  }

  async function deleteTeacher(userId: string) {
    if (!confirm('Leerkracht verwijderen?')) return
    await supabase.from('profiles').delete().eq('user_id', userId)
    setTeachers(t => t.filter(x => x.user_id !== userId))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-violet-600 text-white p-2 rounded-xl">
            <BookOpen size={20} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Klasquiz <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full ml-1">Admin</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{profile?.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut size={16} /> Uitloggen
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserCog size={24} /> Leerkrachten beheren
          </h2>
          <Button onClick={() => setShowAddForm(v => !v)}>
            <Plus size={16} /> Leerkracht toevoegen
          </Button>
        </div>

        {showAddForm && (
          <Card className="p-5 mb-6 flex flex-col gap-3">
            <h3 className="font-semibold text-gray-700">Nieuwe leerkracht</h3>
            <Input label="E-mailadres" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="naam@school.be" />
            <Input label="Wachtwoord" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Tijdelijk wachtwoord" />
            {addError && <p className="text-sm text-red-500">{addError}</p>}
            <div className="flex gap-2">
              <Button onClick={createTeacher} disabled={addLoading}>{addLoading ? 'Bezig...' : 'Aanmaken'}</Button>
              <Button variant="ghost" onClick={() => setShowAddForm(false)}>Annuleren</Button>
            </div>
          </Card>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-20">Laden...</div>
        ) : teachers.length === 0 ? (
          <Card className="p-12 text-center text-gray-400">Nog geen leerkrachten aangemaakt.</Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">E-mailadres</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Aangemaakt</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t, i) => (
                  <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-gray-800">{t.email}</td>
                    <td className="px-4 py-3 text-gray-400">{new Date(t.created_at).toLocaleDateString('nl-BE')}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="danger" size="sm" onClick={() => deleteTeacher(t.user_id)}>
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  )
}
