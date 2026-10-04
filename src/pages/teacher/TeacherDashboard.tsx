import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import type { Quiz } from '../../types/database'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Plus, Play, Edit, Trash2, BarChart2, BookOpen, LogOut, ShieldCheck } from 'lucide-react'

export default function TeacherDashboard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchQuizzes() }, [])

  async function fetchQuizzes() {
    const { data } = await supabase
      .from('quizzes')
      .select('*')
      .eq('teacher_id', profile?.user_id)
      .order('created_at', { ascending: false })
    setQuizzes(data ?? [])
    setLoading(false)
  }

  async function deleteQuiz(id: string) {
    if (!confirm('Quiz verwijderen?')) return
    await supabase.from('quizzes').delete().eq('id', id)
    setQuizzes(q => q.filter(x => x.id !== id))
  }

  async function launchQuiz(quizId: string) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const pin = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const { data, error } = await supabase
      .from('game_sessions')
      .insert({
        quiz_id: quizId,
        pin_code: pin,
        is_live: true,
        is_active: true,
        current_question_index: 0,
        status: 'lobby',
      })
      .select()
      .single()
    if (!error && data) navigate(`/game/${data.id}/host`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-violet-600 text-white p-2 rounded-xl">
            <BookOpen size={20} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Klasquiz</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{profile?.email}</span>
          {profile?.role === 'admin' && (
            <Button variant="secondary" size="sm" onClick={() => navigate('/admin')}>
              <ShieldCheck size={16} /> Admin
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut size={16} /> Uitloggen
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Mijn quizzes</h2>
          <Button onClick={() => navigate('/teacher/quiz/new')}>
            <Plus size={16} /> Nieuwe quiz
          </Button>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-20">Laden...</div>
        ) : quizzes.length === 0 ? (
          <Card className="p-16 text-center">
            <div className="text-4xl mb-4">📝</div>
            <p className="text-gray-500 mb-4">Je hebt nog geen quizzes.</p>
            <Button onClick={() => navigate('/teacher/quiz/new')}>
              <Plus size={16} /> Maak je eerste quiz
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quizzes.map(quiz => (
              <Card key={quiz.id} className="p-5 flex flex-col gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg leading-tight">{quiz.title}</h3>
                  {quiz.description && (
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">{quiz.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-auto">
                  <Button size="sm" onClick={() => launchQuiz(quiz.id)}>
                    <Play size={14} /> Starten
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => navigate(`/teacher/quiz/${quiz.id}/edit`)}>
                    <Edit size={14} /> Bewerken
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => navigate(`/teacher/quiz/${quiz.id}/results`)}>
                    <BarChart2 size={14} /> Resultaten
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => deleteQuiz(quiz.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
