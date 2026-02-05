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
        console.log('DEBUG: Auth Header present:', !!authHeader);
        if (authHeader) console.log('DEBUG: Auth Header length:', authHeader.length);

        if (!authHeader) {
            console.error('DEBUG: Missing authorization header');
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const jwtPayload = decodeJwtPayload(authHeader)
        console.log('DEBUG: JWT Payload:', JSON.stringify(jwtPayload));

        if (!jwtPayload || !jwtPayload.sub) {
            console.error('DEBUG: Invalid token payload');
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

        // FETCH STUDIO BOOKINGS
        if (action === 'fetch_studio_bookings') {
            const { studioId } = params;
            const { data, error } = await supabaseClient
                .from('studio_bookings')
                .select(`
                    *,
                    user:profiles!user_id(full_name, avatar_url, email)
                `)
                .eq('studio_id', studioId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // FETCH MY BOOKINGS
        if (action === 'fetch_my_bookings') {
            const { data, error } = await supabaseClient
                .from('studio_bookings')
                .select(`
                    *,
                    studio:studios!studio_id(name, images, location, rate_per_hour)
                `)
                .eq('user_id', effectiveUserId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // UPDATE BOOKING STATUS
        if (action === 'update_booking_status') {
            const { bookingId, status, cancellation_reason } = params;

            const { data: bookingDetails, error: bookingError } = await supabaseClient
                .from('studio_bookings')
                .select(`
                    *,
                    studio:studio_id(name, owner_id),
                    user:user_id(full_name, email)
                `)
                .eq('id', bookingId)
                .single();

            if (bookingError) throw bookingError;

            const updateData: any = { status };
            if (cancellation_reason) {
                updateData.cancellation_reason = cancellation_reason;
            }

            const { data, error } = await supabaseClient
                .from('studio_bookings')
                .update(updateData)
                .eq('id', bookingId)
                .select()
                .single();

            if (error) throw error;

            const studioName = bookingDetails.studio?.name || 'the studio';
            const bookingDate = bookingDetails.booking_date || 'your requested date';

            let notificationType = 'info';
            let notificationTitle = '';
            let notificationMessage = '';

            if (status === 'cancelled') {
                notificationType = 'warning';
                notificationTitle = 'Booking Declined';
                notificationMessage = `Your booking request for "${studioName}" on ${bookingDate} has been declined.${cancellation_reason ? ` Reason: ${cancellation_reason}` : ''}`;
            } else if (status === 'confirmed') {
                notificationType = 'success';
                notificationTitle = 'Booking Confirmed! 🎉';
                notificationMessage = `Great news! Your booking for "${studioName}" on ${bookingDate} has been confirmed.`;
            }

            if (notificationTitle) {
                await supabaseClient
                    .from('notifications')
                    .insert({
                        user_id: bookingDetails.user_id,
                        type: notificationType,
                        title: notificationTitle,
                        message: notificationMessage,
                        meta: {
                            studio_id: bookingDetails.studio_id,
                            booking_id: bookingId,
                            status: status,
                            booking_date: bookingDate,
                            cancellation_reason: cancellation_reason || null
                        }
                    });
            }

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // PARTIAL SLOT APPROVAL
        if (action === 'partial_slot_approval') {
            const { bookingId, acceptedSlots, declinedSlots, cancellation_reason } = params;

            const { data: bookingDetails, error: bookingError } = await supabaseClient
                .from('studio_bookings')
                .select(`
                    *,
                    studio:studio_id(name, owner_id, hourly_rate),
                    user:user_id(full_name, email)
                `)
                .eq('id', bookingId)
                .single();

            if (bookingError) throw bookingError;

            const studioName = bookingDetails.studio?.name || 'the studio';
            const bookingDate = bookingDetails.booking_date;
            const hourlyRate = bookingDetails.studio?.hourly_rate || 0;

            if (acceptedSlots && acceptedSlots.length > 0) {
                let totalHours = 0;
                for (const slot of acceptedSlots) {
                    const [startH, startM] = slot.start.split(':').map(Number);
                    const [endH, endM] = slot.end.split(':').map(Number);
                    const hours = (endH + endM / 60) - (startH + startM / 60);
                    totalHours += hours;
                }
                const newPrice = totalHours * hourlyRate;

                const allStartTimes = acceptedSlots.map((s: any) => s.start).sort();
                const allEndTimes = acceptedSlots.map((s: any) => s.end).sort();
                const overallStart = allStartTimes[0];
                const overallEnd = allEndTimes[allEndTimes.length - 1];

                const { error: updateError } = await supabaseClient
                    .from('studio_bookings')
                    .update({
                        status: 'confirmed',
                        time_slots: acceptedSlots,
                        start_time: overallStart,
                        end_time: overallEnd,
                        hours: totalHours,
                        final_price: newPrice,
                        subtotal: newPrice
                    })
                    .eq('id', bookingId);

                if (updateError) throw updateError;

                const formatSlot = (s: any) => {
                    const formatTime = (t: string) => {
                        const [h, m] = t.split(':');
                        const hr = parseInt(h);
                        const period = hr >= 12 ? 'PM' : 'AM';
                        const h12 = hr % 12 || 12;
                        return `${h12}:${m} ${period}`;
                    };
                    return `${formatTime(s.start)} - ${formatTime(s.end)}`;
                };

                const acceptedSlotsText = acceptedSlots.map(formatSlot).join(', ');
                const declinedSlotsText = declinedSlots && declinedSlots.length > 0
                    ? declinedSlots.map(formatSlot).join(', ')
                    : '';

                let notificationMessage = `Your booking for "${studioName}" on ${bookingDate} has been partially approved.\n\n✅ Approved: ${acceptedSlotsText}`;
                if (declinedSlotsText) {
                    notificationMessage += `\n❌ Declined: ${declinedSlotsText}`;
                }
                if (cancellation_reason) {
                    notificationMessage += `\n\nNote: ${cancellation_reason}`;
                }

                await supabaseClient
                    .from('notifications')
                    .insert({
                        user_id: bookingDetails.user_id,
                        type: 'info',
                        title: 'Booking Partially Approved',
                        message: notificationMessage,
                        meta: {
                            studio_id: bookingDetails.studio_id,
                            booking_id: bookingId,
                            status: 'partial',
                            booking_date: bookingDate,
                            accepted_slots: acceptedSlots,
                            declined_slots: declinedSlots
                        }
                    });

                return new Response(JSON.stringify({
                    success: true,
                    message: 'Booking partially approved',
                    acceptedSlots,
                    declinedSlots
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
            } else {
                const { error: updateError } = await supabaseClient
                    .from('studio_bookings')
                    .update({
                        status: 'cancelled',
                        cancellation_reason: cancellation_reason || 'All time slots were declined by the studio owner.'
                    })
                    .eq('id', bookingId);

                if (updateError) throw updateError;

                await supabaseClient
                    .from('notifications')
                    .insert({
                        user_id: bookingDetails.user_id,
                        type: 'warning',
                        title: 'Booking Declined',
                        message: `Your booking request for "${studioName}" on ${bookingDate} has been declined. ${cancellation_reason || ''}`,
                        meta: {
                            studio_id: bookingDetails.studio_id,
                            booking_id: bookingId,
                            status: 'cancelled',
                            booking_date: bookingDate
                        }
                    });

                return new Response(JSON.stringify({
                    success: true,
                    message: 'Booking declined'
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
            }
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
