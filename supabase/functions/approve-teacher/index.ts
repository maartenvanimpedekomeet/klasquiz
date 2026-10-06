import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify caller is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!caller) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role').eq('user_id', caller.id).single()
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    const { requestId, email } = await req.json()
    if (!requestId || !email) {
      return new Response(JSON.stringify({ error: 'Missing requestId or email' }), { status: 400, headers: corsHeaders })
    }

    // Invite user — Supabase sends an invite email with a link to set their password
    const { data: { user }, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://klasquiz-rho.vercel.app/reset-password',
    })

    if (inviteError || !user) {
      return new Response(
        JSON.stringify({ error: inviteError?.message ?? 'Invite failed' }),
        { status: 400, headers: corsHeaders },
      )
    }

    // Create teacher profile
    await supabaseAdmin.from('profiles').insert({
      user_id: user.id,
      email: email,
      role: 'teacher',
    })

    // Mark request as approved
    await supabaseAdmin.from('access_requests').update({ status: 'approved' }).eq('id', requestId)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
