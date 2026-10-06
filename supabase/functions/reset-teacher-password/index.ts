import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (!token) return json({ success: false, error: 'Geen Authorization header' })

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !caller) return json({ success: false, error: `Auth mislukt: ${authErr?.message}` })

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('user_id', caller.id).single()
    if (callerProfile?.role !== 'admin') return json({ success: false, error: 'Alleen admins mogen dit doen' })

    const { userId, password } = await req.json()
    if (!userId || !password) return json({ success: false, error: 'userId en password zijn verplicht' })
    if (password.length < 6) return json({ success: false, error: 'Wachtwoord moet minstens 6 tekens bevatten' })

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
    if (error) return json({ success: false, error: `Wachtwoord wijzigen mislukt: ${error.message}` })

    return json({ success: true })
  } catch (err) {
    return json({ success: false, error: `Onverwachte fout: ${String(err)}` })
  }
})
