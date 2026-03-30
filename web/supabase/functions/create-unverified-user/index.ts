// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { email, password, role } = await req.json()

        if (!email || !password) {
            return new Response(JSON.stringify({ error: 'Email and password required' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // Create Supabase Admin client
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Check if user already exists in Auth
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers()

        // Find existing user by email
        let existingUser = listData?.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

        if (existingUser) {
            console.log('Found existing user:', existingUser.id)

            // If they are already confirmed, STOP.
            if (existingUser.email_confirmed_at) {
                return new Response(JSON.stringify({ error: 'This email is already registered and verified. Please login.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            // If they are NOT confirmed, this is a stalled/failed signup.
            // DELETE them to allow a fresh start.
            console.log('User is unverified. Deleting to allow fresh signup...')
            const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(existingUser.id)

            if (deleteError) {
                console.error('Failed to delete unverified user:', deleteError)
                return new Response(JSON.stringify({ error: 'Failed to reset existing account. Please contact support.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            // Also clean up profile if it exists
            await supabaseAdmin.from('profiles').delete().eq('id', existingUser.id)

            console.log('Existing unverified user deleted.')
        }

        // 2. Create Fresh User
        const { data: user, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: false,
            user_metadata: { is_verified: false, role }
        })

        if (createError) {
            return new Response(JSON.stringify({ error: createError.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        if (!user.user) {
            throw new Error('User creation failed');
        }

        const userId = user.user.id;

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert({
                id: userId,
                email: email,
                role: role,
                is_verified: false,
                verification_status: 'NOT_STARTED',
            })

        if (profileError) {
            console.error('Profile creation error:', profileError)
            await supabaseAdmin.auth.admin.deleteUser(userId)
            throw new Error('Failed to create profile: ' + profileError.message)
        }

        return new Response(JSON.stringify({
            user: user.user,
            message: 'User created (unverified)'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
