import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { GameSession, Player, Response } from '../../types/database'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ArrowLeft, Download } from 'lucide-react'

interface SessionWithPlayers extends GameSession {
  players: (Player & { responses: Response[] })[]
  quiz_title?: string
}

export default function QuizResults() {
  const { quizId } = useParams()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SessionWithPlayers[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [quizTitle, setQuizTitle] = useState('')

  useEffect(() => { loadResults() }, [quizId])

  async function loadResults() {
    const { data: quiz } = await supabase.from('quizzes').select('title').eq('id', quizId!).single()
    setQuizTitle(quiz?.title ?? '')

    const { data: gameSessions } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('quiz_id', quizId!)
      .eq('status', 'finished')
      .order('id', { ascending: false })

    if (!gameSessions) { setLoading(false); return }

    const enriched: SessionWithPlayers[] = await Promise.all(gameSessions.map(async (sess) => {
      const { data: players } = await supabase.from('players').select('*, responses(*)').eq('session_id', sess.id)
      return { ...sess, players: players ?? [] }
    }))

    setSessions(enriched)
    if (enriched.length > 0) setSelected(enriched[0].id)
    setLoading(false)
  }

  function exportCSV(sess: SessionWithPlayers) {
    const rows = [
      ['Naam', 'Score', 'Juiste antwoorden', 'Datum'].join(','),
      ...sess.players.map(p => {
        const correct = p.responses.filter(r => r.is_correct).length
        const date = new Date().toLocaleDateString('nl-BE')
        return [p.nickname, p.total_score, correct, date].join(',')
      })
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `klasquiz-resultaten-${sess.pin_code}.csv`
    a.click()
  }

  const activeSess = sessions.find(s => s.id === selected)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/teacher')} className="text-gray-400 hover:text-gray-700 transition cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Resultaten: {quizTitle}</h1>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center text-gray-400 py-20">Laden...</div>
        ) : sessions.length === 0 ? (
          <Card className="p-12 text-center text-gray-400">Nog geen voltooide sessies voor deze quiz.</Card>
        ) : (
          <div className="flex gap-6">
            {/* Session selector */}
            <aside className="w-48 shrink-0">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Sessies</h3>
              <div className="flex flex-col gap-2">
                {sessions.map(sess => (
                  <button
                    key={sess.id}
                    onClick={() => setSelected(sess.id)}
                    className={`text-left px-3 py-2 rounded-xl text-sm transition cursor-pointer ${selected === sess.id ? 'bg-violet-100 text-violet-700 font-medium' : 'hover:bg-gray-100 text-gray-600'}`}
                  >
                    PIN: {sess.pin_code}
                    <br />
                    <span className="text-xs text-gray-400">{sess.players.length} speler{sess.players.length !== 1 ? 's' : ''}</span>
                  </button>
                ))}
              </div>
            </aside>

            {/* Results table */}
            {activeSess && (
              <div className="flex-1">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-700">PIN: {activeSess.pin_code}</h3>
                  <Button variant="secondary" size="sm" onClick={() => exportCSV(activeSess)}>
                    <Download size={14} /> Exporteer CSV
                  </Button>
                </div>
                <Card className="overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Naam</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Score</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Juist</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...activeSess.players]
                        .sort((a, b) => b.total_score - a.total_score)
                        .map((player, i) => (
                          <tr key={player.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-4 py-3 text-gray-400 font-bold">{i + 1}</td>
                            <td className="px-4 py-3 text-gray-800 font-medium">{player.nickname}</td>
                            <td className="px-4 py-3 text-violet-700 font-bold">{player.total_score}</td>
                            <td className="px-4 py-3 text-green-600">
                              {player.responses.filter(r => r.is_correct).length}/{player.responses.length}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
