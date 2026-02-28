// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

function getManilaNowParts() {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(now)

    const get = (type: string) => parts.find((part) => part.type === type)?.value || '00'

    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        time: `${get('hour')}:${get('minute')}:${get('second')}`,
    }
}

function normalizeTime(value?: string | null) {
    if (!value) return '00:00:00'
    const cleaned = value.toString().trim().split(/[.+-]/)[0] || '00:00:00'
    const segments = cleaned.split(':')
    if (segments.length < 2) return '00:00:00'

    const hours = (segments[0] || '00').padStart(2, '0').slice(0, 2)
    const minutes = (segments[1] || '00').padStart(2, '0').slice(0, 2)
    const seconds = (segments[2] || '00').padStart(2, '0').slice(0, 2)

    return `${hours}:${minutes}:${seconds}`
}

async function insertNotificationIfMissing(supabaseClient: any, payload: {
    user_id: string
    type: string
    title: string
    message: string
    image?: string | null
    meta?: Record<string, any>
}) {
    const eventType = payload.meta?.event_type
    const bookingId = payload.meta?.booking_id

    if (eventType && bookingId) {
        const { data: existing } = await supabaseClient
            .from('notifications')
            .select('id')
            .eq('user_id', payload.user_id)
            .contains('meta', { event_type: eventType, booking_id: bookingId })
            .limit(1)

        if (existing && existing.length > 0) return
    }

    await supabaseClient.from('notifications').insert({
        ...payload,
        read: false,
    })
}

async function autoStartBookingsAndNotify(
    supabaseClient: any,
    scope: { studioId?: string; userId?: string }
) {
    const { date: todayManila, time: nowManilaTime } = getManilaNowParts()

    let bookingQuery = supabaseClient
        .from('studio_bookings')
        .select('id, user_id, studio_id, booking_date, start_time, end_time, status, studio:studios(name, owner_id, images)')
        .eq('status', 'confirmed')
        .eq('booking_date', todayManila)

    if (scope.studioId) {
        bookingQuery = bookingQuery.eq('studio_id', scope.studioId)
    }

    if (scope.userId) {
        bookingQuery = bookingQuery.eq('user_id', scope.userId)
    }

    const { data: bookings, error } = await bookingQuery
    if (error || !bookings || bookings.length === 0) return

    for (const booking of bookings) {
        const startTime = normalizeTime(booking.start_time)
        const endTime = normalizeTime(booking.end_time)

        if (nowManilaTime < startTime || nowManilaTime >= endTime) continue

        const { data: updatedBooking, error: updateError } = await supabaseClient
            .from('studio_bookings')
            .update({
                status: 'checked_in',
                check_in_time: new Date().toISOString(),
            })
            .eq('id', booking.id)
            .eq('status', 'confirmed')
            .select('id')
            .maybeSingle()

        if (updateError || !updatedBooking) continue

        const studioName = booking.studio?.name || 'the studio'
        const image = booking.studio?.images?.[0] || null
        const recipients = [booking.user_id, booking.studio?.owner_id].filter(Boolean) as string[]

        for (const recipientId of [...new Set(recipients)]) {
            const isCustomer = recipientId === booking.user_id
            await insertNotificationIfMissing(supabaseClient, {
                user_id: recipientId,
                type: 'info',
                title: 'Booking Started',
                message: isCustomer
                    ? `Your booking at ${studioName} has started.`
                    : `A booking at ${studioName} has started.`,
                image,
                meta: {
                    booking_id: booking.id,
                    studio_id: booking.studio_id,
                    booking_date: booking.booking_date,
                    event_type: 'booking_auto_started',
                }
            })
        }
    }
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

            await autoStartBookingsAndNotify(supabaseClient, { studioId })

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
            await autoStartBookingsAndNotify(supabaseClient, { userId: effectiveUserId })

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

            if (['late', 'not_attending', 'no_show'].includes(status)) {
                const { data: bookingDetails, error: bookingError } = await supabaseClient
                    .from('studio_bookings')
                    .select(`
                        id,
                        user_id,
                        studio_id,
                        booking_date,
                        start_time,
                        studio:studio_id(name, owner_id, images)
                    `)
                    .eq('id', bookingId)
                    .single();

                if (bookingError) throw bookingError;

                const studioName = bookingDetails.studio?.name || 'the studio';
                const recipients = [bookingDetails.user_id, bookingDetails.studio?.owner_id]
                    .filter(Boolean) as string[];

                for (const recipientId of [...new Set(recipients)]) {
                    await insertNotificationIfMissing(supabaseClient, {
                        user_id: recipientId,
                        type: 'warning',
                        title: status === 'late' ? 'Late Arrival Alert' : 'Attendance Alert',
                        message: status === 'late'
                            ? `A participant for the booking at ${studioName} on ${bookingDetails.booking_date} (${bookingDetails.start_time}) has reported they will be late.`
                            : `A participant for the booking at ${studioName} on ${bookingDetails.booking_date} (${bookingDetails.start_time}) has reported they cannot attend.`,
                        image: bookingDetails.studio?.images?.[0] || null,
                        meta: {
                            booking_id: bookingDetails.id,
                            studio_id: bookingDetails.studio_id,
                            booking_date: bookingDetails.booking_date,
                            issue_status: status,
                            event_type: `booking_${status}`,
                            reported_by_user_id: effectiveUserId,
                        }
                    })
                }

                return new Response(JSON.stringify({
                    success: true,
                    message: 'Attendance notification sent.'
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
            }

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
