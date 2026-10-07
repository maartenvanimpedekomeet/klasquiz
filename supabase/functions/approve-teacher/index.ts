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

    const { requestId, email, password } = await req.json()
    if (!email || !password) return json({ success: false, error: 'email en password zijn verplicht' })

    // Check if user already exists
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
    const existing = users.find(u => u.email === email)

    let userId: string

    if (existing) {
      // Update existing user's password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, { password })
      if (updateError) return json({ success: false, error: `Wachtwoord bijwerken mislukt: ${updateError.message}` })
      userId = existing.id
    } else {
      // Create new user with confirmed email
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (createError || !newUser?.user) return json({ success: false, error: `Gebruiker aanmaken mislukt: ${createError?.message}` })
      userId = newUser.user.id
    }

    // Create or update teacher profile
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      user_id: userId,
      email,
      role: 'teacher',
    }, { onConflict: 'user_id' })

    if (profileError) return json({ success: false, error: `Profiel aanmaken mislukt: ${profileError.message}` })

    // Mark request approved (only when coming from an access request)
    if (requestId) {
      await supabaseAdmin.from('access_requests').update({ status: 'approved' }).eq('id', requestId)
    }

    return json({ success: true })
  } catch (err) {
    return json({ success: false, error: `Onverwachte fout: ${String(err)}` })
  }
})
