export type QuestionType = 'multiple_choice' | 'drag_order' | 'select_image' | 'brainstorm' | 'pin'
export type SessionStatus = 'lobby' | 'active' | 'finished'
export type UserRole = 'admin' | 'teacher'
export type SessionType = 'quiz' | 'survey'

export interface AvatarData {
  face: string
  bg: string
  hat: string
  extra: string
}

export const DEFAULT_AVATAR: AvatarData = { face: '😀', bg: 'yellow', hat: '', extra: '' }

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; user_id: string; email: string; role: UserRole; created_at: string }
        Insert: { user_id: string; email: string; role: UserRole }
        Update: { email?: string; role?: UserRole }
      }
      quizzes: {
        Row: { id: string; teacher_id: string; title: string; description: string | null; created_at: string }
        Insert: { teacher_id?: string; title: string; description?: string | null }
        Update: { title?: string; description?: string | null }
      }
      questions: {
        Row: {
          id: string; quiz_id: string; question_type: QuestionType
          question_text: string; image_url: string | null
          time_limit: number; points_enabled: boolean; points_value: number; order_index: number
          zone_polygon: {x: number; y: number}[] | null
        }
        Insert: {
          quiz_id: string; question_type?: QuestionType
          question_text?: string; image_url?: string | null
          time_limit?: number; points_enabled?: boolean; points_value?: number; order_index?: number
          zone_polygon?: {x: number; y: number}[] | null
        }
        Update: {
          question_type?: QuestionType; question_text?: string; image_url?: string | null
          time_limit?: number; points_enabled?: boolean; points_value?: number; order_index?: number
        }
      }
      options: {
        Row: {
          id: string; question_id: string; option_text: string | null
          image_url: string | null; is_correct: boolean; correct_order: number | null
        }
        Insert: {
          question_id: string; option_text?: string | null
          image_url?: string | null; is_correct?: boolean; correct_order?: number | null
        }
        Update: {
          option_text?: string | null; image_url?: string | null
          is_correct?: boolean; correct_order?: number | null
        }
      }
      game_sessions: {
        Row: {
          id: string; quiz_id: string | null; pin_code: string
          is_live: boolean; is_active: boolean
          current_question_index: number; status: SessionStatus
          answer_visible: boolean
          hide_scores: boolean
          question_order: string[]
          session_type: SessionType
          anonymous: boolean
        }
        Insert: {
          quiz_id?: string | null; pin_code: string; is_live?: boolean; is_active?: boolean
          current_question_index?: number; status?: SessionStatus
          answer_visible?: boolean; hide_scores?: boolean; question_order?: string[]
          session_type?: SessionType; anonymous?: boolean
        }
        Update: {
          pin_code?: string; is_live?: boolean; is_active?: boolean
          current_question_index?: number; status?: SessionStatus
          answer_visible?: boolean; hide_scores?: boolean; question_order?: string[]
          session_type?: SessionType; anonymous?: boolean
        }
      }
      survey_responses: {
        Row: {
          id: string; session_id: string; player_id: string
          response_text: string; created_at: string
        }
        Insert: {
          session_id: string; player_id: string; response_text: string
        }
        Update: Record<string, never>
      }
      players: {
        Row: { id: string; session_id: string; nickname: string; total_score: number; avatar: AvatarData }
        Insert: { session_id: string; nickname: string; total_score?: number; avatar?: AvatarData }
        Update: { nickname?: string; total_score?: number; avatar?: AvatarData }
      }
      responses: {
        Row: {
          id: string; session_id: string; player_id: string; question_id: string
          option_id: string | null; is_correct: boolean; points_awarded: number; response_time: number
          response_text: string | null; response_x: number | null; response_y: number | null
        }
        Insert: {
          session_id: string; player_id: string; question_id: string
          option_id?: string | null; is_correct?: boolean; points_awarded?: number; response_time?: number
          response_text?: string | null; response_x?: number | null; response_y?: number | null
        }
        Update: {
          option_id?: string | null; is_correct?: boolean; points_awarded?: number; response_time?: number
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Quiz = Database['public']['Tables']['quizzes']['Row']
export type Question = Database['public']['Tables']['questions']['Row']
export type Option = Database['public']['Tables']['options']['Row']
export type GameSession = Database['public']['Tables']['game_sessions']['Row']
export type Player = Database['public']['Tables']['players']['Row']
export type Response = Database['public']['Tables']['responses']['Row']

export type QuestionWithOptions = Question & { options: Option[] }
export type QuizWithQuestions = Quiz & { questions: QuestionWithOptions[] }
export type SurveyResponse = Database['public']['Tables']['survey_responses']['Row']
