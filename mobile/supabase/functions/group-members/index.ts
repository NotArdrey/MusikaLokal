// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

function decodeJwtPayload(token: string): { sub?: string; email?: string } | null {
    try {
        const parts = token.replace('Bearer ', '').split('.')
        if (parts.length !== 3) return null
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        while (base64.length % 4) {
            base64 += '='
        }
        const payload = JSON.parse(atob(base64))
        return payload
    } catch (e) {
        console.error('JWT decode error:', e)
        return null
    }
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const jwtPayload = decodeJwtPayload(authHeader)
        if (!jwtPayload || !jwtPayload.sub) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const authenticatedUserId = jwtPayload.sub

        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )

        if (!Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
            console.error('Missing Supabase env vars');
            return new Response(JSON.stringify({ error: 'Server misconfiguration: Missing Supabase env vars' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

        const { action, ...params } = await req.json()
        const { userId } = params

        if (userId && userId !== authenticatedUserId) {
            return new Response(JSON.stringify({ error: 'Forbidden: userId mismatch' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        const effectiveUserId = userId || authenticatedUserId

        // FETCH GROUP MEMBERS
        if (action === 'fetch_group_members') {
            const { groupId } = params;

            if (!groupId) {
                return new Response(JSON.stringify({ error: 'Missing groupId' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data, error } = await supabaseClient
                .from('group_members')
                .select(`
                    id,
                    user_id,
                    role,
                    joined_at,
                    user:profiles!user_id(id, full_name, avatar_url, email, skills, genres)
                `)
                .eq('group_id', groupId)
                .order('joined_at', { ascending: true });

            if (error) throw error;

            return new Response(JSON.stringify(data || []), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // ADD MEMBER TO GROUP
        if (action === 'add_group_member') {
            const { groupId, targetUserId, memberRole } = params;

            if (!groupId || !targetUserId) {
                return new Response(JSON.stringify({ error: 'Missing groupId or targetUserId' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data: group, error: groupError } = await supabaseClient
                .from('groups')
                .select('owner_id, name')
                .eq('id', groupId)
                .single();

            if (groupError || !group) {
                return new Response(JSON.stringify({ error: 'Group not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                });
            }

            if (group.owner_id !== effectiveUserId) {
                return new Response(JSON.stringify({ error: 'Only the group owner can add members' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            const { data: existingMember } = await supabaseClient
                .from('group_members')
                .select('id')
                .eq('group_id', groupId)
                .eq('user_id', targetUserId)
                .maybeSingle();

            if (existingMember) {
                return new Response(JSON.stringify({ error: 'User is already a member of this group' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data, error } = await supabaseClient
                .from('group_members')
                .insert({
                    group_id: groupId,
                    user_id: targetUserId,
                    role: memberRole || 'member'
                })
                .select()
                .single();

            if (error) throw error;

            await supabaseClient.from('notifications').insert({
                user_id: targetUserId,
                type: 'success',
                title: 'Added to Group',
                message: `You have been added to the group "${group.name}"`,
                meta: { type: 'group_member_added', group_id: groupId }
            });

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // REMOVE MEMBER FROM GROUP
        if (action === 'remove_group_member') {
            const { groupId, targetUserId } = params;

            if (!groupId || !targetUserId) {
                return new Response(JSON.stringify({ error: 'Missing groupId or targetUserId' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data: group, error: groupError } = await supabaseClient
                .from('groups')
                .select('owner_id, name')
                .eq('id', groupId)
                .single();

            if (groupError || !group) {
                return new Response(JSON.stringify({ error: 'Group not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                });
            }

            if (group.owner_id !== effectiveUserId && targetUserId !== effectiveUserId) {
                return new Response(JSON.stringify({ error: 'Only the group owner can remove members, or members can leave themselves' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            if (targetUserId === group.owner_id) {
                return new Response(JSON.stringify({ error: 'The group owner cannot be removed. Transfer leadership first.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { error } = await supabaseClient
                .from('group_members')
                .delete()
                .eq('group_id', groupId)
                .eq('user_id', targetUserId);

            if (error) throw error;

            if (targetUserId !== effectiveUserId) {
                await supabaseClient.from('notifications').insert({
                    user_id: targetUserId,
                    type: 'warning',
                    title: 'Removed from Group',
                    message: `You have been removed from the group "${group.name}"`,
                    meta: { type: 'group_member_removed', group_id: groupId }
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // UPDATE MEMBER ROLE IN GROUP
        if (action === 'update_group_member_role') {
            const { groupId, targetUserId, newRole } = params;

            if (!groupId || !targetUserId || !newRole) {
                return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data: group, error: groupError } = await supabaseClient
                .from('groups')
                .select('owner_id')
                .eq('id', groupId)
                .single();

            if (groupError || !group || group.owner_id !== effectiveUserId) {
                return new Response(JSON.stringify({ error: 'Only the group owner can update member roles' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            if (targetUserId === group.owner_id) {
                return new Response(JSON.stringify({ error: 'Cannot change owner role. Use leadership transfer instead.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data, error } = await supabaseClient
                .from('group_members')
                .update({ role: newRole })
                .eq('group_id', groupId)
                .eq('user_id', targetUserId)
                .select()
                .single();

            if (error) throw error;

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        throw new Error('Invalid action')

    } catch (error: any) {
        console.error('❌ Edge Function Error:', error);
        return new Response(JSON.stringify({
            error: error.message,
            details: error.toString(),
            hint: error.hint || null,
            code: error.code || null
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
