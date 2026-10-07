import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import type { Profile, AccessRequest } from '../../types/database'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { BookOpen, LogOut, Trash2, UserCog, Mail, Check, X, KeyRound } from 'lucide-react'

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending:  { label: 'In afwachting', className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Goedgekeurd',  className: 'bg-green-100 text-green-700'  },
  rejected: { label: 'Geweigerd',    className: 'bg-red-100 text-red-600'      },
}

export default function AdminDashboard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [teachers, setTeachers] = useState<Profile[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [resetPw, setResetPw] = useState<Record<string, string>>({})
  const [resetting, setResetting] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [{ data: ts }, { data: rs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'teacher').order('created_at'),
      supabase.from('access_requests').select('*').order('created_at', { ascending: false }),
    ])
    setTeachers(ts ?? [])
    setRequests(rs ?? [])
    setLoading(false)
  }

  async function approveRequest(req: AccessRequest) {
    const password = passwords[req.id]?.trim()
    if (!password || password.length < 6) {
      alert('Stel eerst een tijdelijk wachtwoord in (minstens 6 tekens).')
      return
    }
    setApproving(req.id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await supabase.functions.invoke('approve-teacher', {
      body: { requestId: req.id, email: req.email, password },
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    const errMsg = res.data?.error ?? res.error?.message
    if (errMsg) {
      alert(`Fout bij goedkeuren:\n${errMsg}`)
    } else {
      alert(`✓ ${req.email} is aangemaakt.\n\nDeel dit tijdelijke wachtwoord:\n${password}`)
      setRequests(rs => rs.map(r => r.id === req.id ? { ...r, status: 'approved' } : r))
      loadAll()
    }
    setApproving(null)
  }

  async function addTeacher() {
    const email = newEmail.trim()
    const password = newPassword.trim()
    if (!email || !password || password.length < 6) {
      alert('Vul een geldig e-mailadres en wachtwoord in (minstens 6 tekens).')
      return
    }
    setAdding(true)
    const { data: { session: authSession } } = await supabase.auth.getSession()
    const res = await supabase.functions.invoke('approve-teacher', {
      body: { requestId: null, email, password },
      headers: { Authorization: `Bearer ${authSession?.access_token ?? ''}` },
    })
    const errMsg = res.data?.error ?? res.error?.message
    if (errMsg) {
      alert(`Fout:\n${errMsg}`)
    } else {
      alert(`✓ ${email} is aangemaakt.\n\nWachtwoord:\n${password}`)
      setNewEmail('')
      setNewPassword('')
      loadAll()
    }
    setAdding(false)
  }

  async function rejectRequest(id: string) {
    await supabase.from('access_requests').update({ status: 'rejected' }).eq('id', id)
    setRequests(rs => rs.map(r => r.id === id ? { ...r, status: 'rejected' } : r))
  }

  async function resetPassword(t: Profile) {
    const pw = resetPw[t.user_id]?.trim()
    if (!pw || pw.length < 6) {
      alert('Voer een nieuw wachtwoord in (minstens 6 tekens).')
      return
    }
    setResetting(t.user_id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await supabase.functions.invoke('reset-teacher-password', {
      body: { userId: t.user_id, password: pw },
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    const errMsg = res.data?.error ?? res.error?.message
    if (errMsg) {
      alert(`Fout:\n${errMsg}`)
    } else {
      alert(`✓ Wachtwoord van ${t.email} gewijzigd.\n\nNieuw wachtwoord:\n${pw}`)
      setResetPw(p => ({ ...p, [t.user_id]: '' }))
    }
    setResetting(null)
  }

  async function deleteTeacher(userId: string) {
    if (!confirm('Leerkracht verwijderen?')) return
    await supabase.from('profiles').delete().eq('user_id', userId)
    setTeachers(t => t.filter(x => x.user_id !== userId))
  }

  const pendingRequests = requests.filter(r => r.status === 'pending')
  const otherRequests  = requests.filter(r => r.status !== 'pending')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-violet-600 text-white p-2 rounded-xl">
            <BookOpen size={20} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Klasquiz <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full ml-1">Admin</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{profile?.email}</span>
          <Button variant="secondary" size="sm" onClick={() => navigate('/teacher')}>
            <BookOpen size={16} /> Mijn quizzen
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut size={16} /> Uitloggen
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-10">

        {/* Access requests */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-5">
            <Mail size={22} /> Toegangsaanvragen
            {pendingRequests.length > 0 && (
              <span className="text-sm bg-yellow-400 text-gray-900 font-bold px-2 py-0.5 rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </h2>

          {loading ? (
            <p className="text-gray-400 text-sm">Laden...</p>
          ) : requests.length === 0 ? (
            <Card className="p-8 text-center text-gray-400">Nog geen aanvragen.</Card>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingRequests.map(req => (
                <Card key={req.id} className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{req.email}</p>
                    {req.message && (
                      <p className="text-sm text-gray-500 mt-0.5 italic">"{req.message}"</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(req.created_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="text"
                      placeholder="Tijdelijk wachtwoord"
                      value={passwords[req.id] ?? ''}
                      onChange={e => setPasswords(p => ({ ...p, [req.id]: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    <Button
                      size="sm"
                      onClick={() => approveRequest(req)}
                      disabled={approving === req.id}
                      className="bg-green-500 hover:bg-green-400 text-white"
                    >
                      <Check size={14} /> {approving === req.id ? 'Bezig...' : 'Goedkeuren'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => rejectRequest(req.id)}
                      disabled={approving === req.id}
                    >
                      <X size={14} /> Weigeren
                    </Button>
                  </div>
                </Card>
              ))}

              {otherRequests.length > 0 && (
                <details className="mt-2">
                  <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                    Bekijk geschiedenis ({otherRequests.length})
                  </summary>
                  <div className="flex flex-col gap-2 mt-2">
                    {otherRequests.map(req => {
                      const st = STATUS_LABEL[req.status] ?? STATUS_LABEL.pending
                      return (
                        <Card key={req.id} className="p-3 flex items-center gap-3 opacity-70">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700">{req.email}</p>
                            {req.message && <p className="text-xs text-gray-400 italic">"{req.message}"</p>}
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${st.className}`}>
                            {st.label}
                          </span>
                        </Card>
                      )
                    })}
                  </div>
                </details>
              )}
            </div>
          )}
        </section>

        {/* Teachers list */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-5">
            <UserCog size={22} /> Leerkrachten
          </h2>

          {/* Manual add */}
          <Card className="p-4 mb-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Leerkracht manueel toevoegen</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="email"
                placeholder="E-mailadres"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <input
                type="text"
                placeholder="Tijdelijk wachtwoord"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTeacher()}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <Button size="sm" onClick={addTeacher} disabled={adding}>
                <Check size={14} /> {adding ? 'Bezig...' : 'Toevoegen'}
              </Button>
            </div>
          </Card>

          {loading ? (
            <p className="text-gray-400 text-sm">Laden...</p>
          ) : teachers.length === 0 ? (
            <Card className="p-12 text-center text-gray-400">Nog geen leerkrachten.</Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">E-mailadres</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Aangemaakt</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Wachtwoord instellen</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t, i) => (
                    <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-gray-800">{t.email}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {new Date(t.created_at).toLocaleDateString('nl-BE')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <input
                            type="text"
                            placeholder="Nieuw wachtwoord"
                            value={resetPw[t.user_id] ?? ''}
                            onChange={e => setResetPw(p => ({ ...p, [t.user_id]: e.target.value }))}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-40 focus:outline-none focus:ring-2 focus:ring-violet-400"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => resetPassword(t)}
                            disabled={resetting === t.user_id}
                          >
                            <KeyRound size={14} /> {resetting === t.user_id ? '...' : 'Instellen'}
                          </Button>
                        </div>
                      </td>
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
        </section>

      </main>
    </div>
  )
}
