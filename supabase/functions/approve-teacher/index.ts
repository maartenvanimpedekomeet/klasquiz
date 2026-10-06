import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
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

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return json({ error: 'Geen Authorization header' }, 401)

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !caller) return json({ error: `Auth mislukt: ${authErr?.message}` }, 401)

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role').eq('user_id', caller.id).single()
    if (profile?.role !== 'admin') return json({ error: 'Alleen admins mogen dit doen' }, 403)

    const { requestId, email } = await req.json()
    if (!requestId || !email) return json({ error: 'requestId en email zijn verplicht' }, 400)

    // Invite user via Supabase Auth
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://klasquiz-rho.vercel.app/reset-password',
    })

    if (inviteError || !inviteData?.user) {
      return json({ error: `Uitnodiging mislukt: ${inviteError?.message}` }, 400)
    }

    const invitedUser = inviteData.user

    // Create or update teacher profile
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      user_id: invitedUser.id,
      email: email,
      role: 'teacher',
    }, { onConflict: 'user_id' })

    if (profileError) {
      return json({ error: `Profiel aanmaken mislukt: ${profileError.message}` }, 500)
    }

    // Mark request approved
    await supabaseAdmin.from('access_requests').update({ status: 'approved' }).eq('id', requestId)

    return json({ success: true })
  } catch (err) {
    return json({ error: `Onverwachte fout: ${String(err)}` }, 500)
  }
})
