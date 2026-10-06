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

    // Verify caller is admin
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (!token) return json({ success: false, error: 'Geen Authorization header' })

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !caller) return json({ success: false, error: `Auth mislukt: ${authErr?.message}` })

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('user_id', caller.id).single()
    if (callerProfile?.role !== 'admin') return json({ success: false, error: 'Alleen admins mogen dit doen' })

    const { requestId, email } = await req.json()
    if (!requestId || !email) return json({ success: false, error: 'requestId en email zijn verplicht' })

    // Invite user
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://klasquiz-rho.vercel.app/reset-password',
    })

    if (inviteError || !inviteData?.user) {
      return json({ success: false, error: `Uitnodiging mislukt: ${inviteError?.message ?? 'onbekende fout'}` })
    }

    // Create or update teacher profile
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      user_id: inviteData.user.id,
      email,
      role: 'teacher',
    }, { onConflict: 'user_id' })

    if (profileError) {
      return json({ success: false, error: `Profiel aanmaken mislukt: ${profileError.message}` })
    }

    // Mark request approved
    await supabaseAdmin.from('access_requests').update({ status: 'approved' }).eq('id', requestId)

    return json({ success: true })
  } catch (err) {
    return json({ success: false, error: `Onverwachte fout: ${String(err)}` })
  }
})
