// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req: Request) => {
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

        const sbUrl = Deno.env.get('SUPABASE_URL');
        const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        console.log(`[listings-crud] Req received. Action: ${(await req.clone().json()).action}, User: ${(await req.clone().json()).userId}`);

        if (!sbUrl || !sbKey) {
            console.error('[listings-crud] Missing Supabase env vars');
            return new Response(JSON.stringify({ error: 'Server misconfiguration: Missing Supabase env vars' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

        const supabaseClient = createClient(sbUrl, sbKey)

        const body = await req.json()
        const { action, ...params } = body
        const { userId } = params

        console.log(`[listings-crud] Processing action: ${action}`);

        if (userId && userId !== authenticatedUserId) {
            console.error(`[listings-crud] Forbidden: userId mismatch. Req: ${userId}, Auth: ${authenticatedUserId}`);
            return new Response(JSON.stringify({ error: 'Forbidden: userId mismatch' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        const effectiveUserId = userId || authenticatedUserId

        // CREATE SINGLE NOTIFICATION
        if (action === 'create_notification') {
            const { targetUserId, title, message, type, image, meta } = params

            if (!targetUserId || !title || !message) {
                return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const { data, error } = await supabaseClient
                .from('notifications')
                .insert({
                    user_id: targetUserId,
                    type: type || 'info',
                    title,
                    message,
                    image: image || null,
                    meta: meta || null,
                    read: false
                })
                .select()
                .single()

            if (error) throw error
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // CREATE MULTIPLE NOTIFICATIONS
        if (action === 'create_notifications') {
            const { notifications } = params

            if (!Array.isArray(notifications) || notifications.length === 0) {
                return new Response(JSON.stringify({ error: 'No notifications provided' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const payload = notifications
                .filter((n: any) => n && n.user_id && n.title && n.message)
                .map((n: any) => ({
                    user_id: n.user_id,
                    type: n.type || 'info',
                    title: n.title,
                    message: n.message,
                    image: n.image || null,
                    meta: n.meta || null,
                    read: false
                }))

            if (payload.length === 0) {
                return new Response(JSON.stringify({ error: 'Invalid notification payload' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const { data, error } = await supabaseClient
                .from('notifications')
                .insert(payload)
                .select()

            if (error) throw error
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // FETCH MY GIGS
        if (action === 'fetch_my_gigs') {
            const { data, error } = await supabaseClient
                .from('gigs_with_stats')
                .select('*')
                .eq('organizer_id', effectiveUserId)
                .order('created_at', { ascending: false })

            if (error) throw error
            const mapped = (data || []).map((item: any) => ({
                ...item,
                rating: item.rating || 0,
                review_count: item.review_count || 0
            }))
            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH MY GROUPS
        if (action === 'fetch_my_groups') {
            const { data, error } = await supabaseClient
                .from('groups_with_stats')
                .select('*')
                .eq('owner_id', effectiveUserId)
                .order('created_at', { ascending: false })

            if (error) throw error
            const mapped = (data || []).map((item: any) => ({
                ...item,
                rating: item.rating || 0,
                review_count: item.review_count || 0
            }))
            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH MY STUDIOS
        if (action === 'fetch_my_studios') {
            const { data, error } = await supabaseClient
                .from('studios_with_stats')
                .select('*')
                .eq('owner_id', effectiveUserId)
                .order('created_at', { ascending: false })

            if (error) throw error

            let settingsByStudioId = new Map<string, any>()
            const studioIds = (data || []).map((item: any) => item.id).filter(Boolean)
            if (studioIds.length > 0) {
                const { data: settingsData, error: settingsError } = await supabaseClient
                    .from('studio_settings')
                    .select('studio_id, lead_time_hours, weekend_multiplier, peak_season_multiplier, peak_season_dates, off_peak_multiplier, off_peak_dates')
                    .in('studio_id', studioIds)

                if (!settingsError && settingsData) {
                    settingsByStudioId = new Map(settingsData.map((row: any) => [row.studio_id, row]))
                }
            }

            const mapped = (data || []).map((item: any) => ({
                ...item,
                rating: item.rating || 0,
                review_count: item.review_count || 0,
                ...(settingsByStudioId.get(item.id)
                    ? {
                        lead_time_hours: settingsByStudioId.get(item.id).lead_time_hours,
                        weekend_multiplier: settingsByStudioId.get(item.id).weekend_multiplier,
                        peak_season_multiplier: settingsByStudioId.get(item.id).peak_season_multiplier,
                        peak_season_dates: settingsByStudioId.get(item.id).peak_season_dates,
                        off_peak_multiplier: settingsByStudioId.get(item.id).off_peak_multiplier,
                        off_peak_dates: settingsByStudioId.get(item.id).off_peak_dates,
                        booking_settings: {
                            lead_time_hours: settingsByStudioId.get(item.id).lead_time_hours,
                            weekend_multiplier: settingsByStudioId.get(item.id).weekend_multiplier,
                            peak_season_multiplier: settingsByStudioId.get(item.id).peak_season_multiplier,
                            peak_season_dates: settingsByStudioId.get(item.id).peak_season_dates,
                            off_peak_multiplier: settingsByStudioId.get(item.id).off_peak_multiplier,
                            off_peak_dates: settingsByStudioId.get(item.id).off_peak_dates,
                        }
                    }
                    : { booking_settings: null })
            }))

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH SINGLE ENTITY
        if (action === 'fetch_one') {
            const { type, id } = params
            const viewName = type + 's_with_stats'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            const { data, error } = await supabaseClient
                .from(viewName)
                .select('*')
                .eq('id', id)
                .eq(ownerField, effectiveUserId)
                .maybeSingle()

            if (error) throw error
            if (!data) {
                return new Response(JSON.stringify(null), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
            }

            if (type === 'studio') {
                const { data: operatingHours, error: hoursError } = await supabaseClient
                    .from('studio_operating_hours')
                    .select('*')
                    .eq('studio_id', id)
                    .order('slot_order', { ascending: true });

                if (!hoursError && operatingHours) {
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const availability = dayNames.map((dayName, index) => {
                        const dayHours = operatingHours.filter((h: any) => h.day_of_week === index && h.is_open);
                        return {
                            day: dayName,
                            slots: dayHours.map((h: any) => ({
                                start: h.open_time,
                                end: h.close_time
                            }))
                        };
                    });
                    data.availability = availability;
                }

                const { data: studioSettings, error: settingsError } = await supabaseClient
                    .from('studio_settings')
                    .select('lead_time_hours, weekend_multiplier, peak_season_multiplier, peak_season_dates, off_peak_multiplier, off_peak_dates')
                    .eq('studio_id', id)
                    .maybeSingle();

                if (!settingsError && studioSettings) {
                    data.lead_time_hours = studioSettings.lead_time_hours;
                    data.weekend_multiplier = studioSettings.weekend_multiplier;
                    data.peak_season_multiplier = studioSettings.peak_season_multiplier;
                    data.peak_season_dates = studioSettings.peak_season_dates;
                    data.off_peak_multiplier = studioSettings.off_peak_multiplier;
                    data.off_peak_dates = studioSettings.off_peak_dates;
                    data.booking_settings = {
                        lead_time_hours: studioSettings.lead_time_hours,
                        weekend_multiplier: studioSettings.weekend_multiplier,
                        peak_season_multiplier: studioSettings.peak_season_multiplier,
                        peak_season_dates: studioSettings.peak_season_dates,
                        off_peak_multiplier: studioSettings.off_peak_multiplier,
                        off_peak_dates: studioSettings.off_peak_dates
                    };
                }
            }

            const mapped = {
                ...data,
                rating: data.rating || 0,
                review_count: data.review_count || 0
            }

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // CREATE ENTITY
        if (action === 'create') {
            const { type, payload } = params
            const table = type + 's'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            let studioAvailability = null;
            let calendarAvailability = null;
            let bookingSettings = null;
            let insertPayload = { ...payload };

            if (type === 'studio') {
                const validStudioColumns = [
                    'name', 'address', 'hourly_rate', 'description', 'amenities',
                    'images', 'latitude', 'longitude', 'rate', 'contract_url',
                    'availability', 'instruments', 'type', 'types', 'rehearsal_rate',
                    'recording_rate', 'open_dates', 'pax', 'business_permit_url'
                ];
                const filteredPayload: any = {};
                for (const key of validStudioColumns) {
                    if (insertPayload[key] !== undefined) {
                        filteredPayload[key] = insertPayload[key];
                    }
                }
                if (insertPayload.calendar_availability) filteredPayload.calendar_availability = insertPayload.calendar_availability;
                if (insertPayload.booking_settings) filteredPayload.booking_settings = insertPayload.booking_settings;
                insertPayload = filteredPayload;
            }

            // SPAM PREVENTION for Gig Applications
            if (type === 'gig_application') {
                const { gig_id, slot_type } = insertPayload;

                const { data: gigData, error: gigError } = await supabaseClient
                    .from('gigs')
                    .select('reapplication_cooldown_days, requirements, slots_filled, total_slots_filled, status')
                    .eq('id', gig_id)
                    .single();

                if (gigError) throw gigError;

                if (gigData.status !== 'open') {
                    throw new Error('This gig is no longer accepting applications.');
                }

                const totalSlotsNeeded = gigData.requirements?.total_slots_needed || 999;
                const totalSlotsFilled = gigData.total_slots_filled || 0;

                if (totalSlotsFilled >= totalSlotsNeeded) {
                    throw new Error('All performer slots for this gig have been filled.');
                }

                if (slot_type && gigData.requirements?.slots?.[slot_type]) {
                    const slotNeeded = gigData.requirements.slots[slot_type]?.needed || 0;
                    const slotFilled = gigData.slots_filled?.[slot_type]?.accepted || 0;

                    if (slotNeeded > 0 && slotFilled >= slotNeeded) {
                        throw new Error(`All ${slot_type} slots have been filled. Try applying for a different slot type.`);
                    }
                }

                const { data: existingApp, error: existingError } = await supabaseClient
                    .from('gig_applications')
                    .select('id, status')
                    .eq('applicant_id', effectiveUserId)
                    .eq('gig_id', gig_id)
                    .in('status', ['pending', 'accepted'])
                    .maybeSingle();

                if (existingError) throw existingError;

                if (existingApp) {
                    if (existingApp.status === 'accepted') {
                        throw new Error('You have already been accepted for this gig.');
                    }
                    throw new Error('You already have a pending application for this gig.');
                }

                const cooldownDays = gigData.reapplication_cooldown_days ?? 30;

                if (cooldownDays > 0) {
                    const { data: rejectedApp, error: rejectedError } = await supabaseClient
                        .from('gig_applications')
                        .select('id, rejected_at, created_at')
                        .eq('applicant_id', effectiveUserId)
                        .eq('gig_id', gig_id)
                        .eq('status', 'rejected')
                        .order('rejected_at', { ascending: false, nullsFirst: false })
                        .limit(1)
                        .maybeSingle();

                    if (rejectedError) throw rejectedError;

                    if (rejectedApp) {
                        const rejectionDate = rejectedApp.rejected_at || rejectedApp.created_at;
                        const cooldownEnds = new Date(rejectionDate);
                        cooldownEnds.setDate(cooldownEnds.getDate() + cooldownDays);

                        if (new Date() < cooldownEnds) {
                            const daysRemaining = Math.ceil((cooldownEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                            throw new Error(`You cannot reapply to this gig yet. Please wait ${daysRemaining} more day(s).`);
                        }
                    }
                }
            }

            if (type === 'studio' && insertPayload.availability) {
                studioAvailability = insertPayload.availability;
                delete insertPayload.availability;
            }

            if (type === 'studio' && insertPayload.calendar_availability) {
                calendarAvailability = insertPayload.calendar_availability;
                delete insertPayload.calendar_availability;
            }

            if (type === 'studio' && insertPayload.booking_settings) {
                bookingSettings = insertPayload.booking_settings;
                delete insertPayload.booking_settings;
            }

            if (type === 'gig') {
                const validGigColumns = [
                    'name', 'location', 'budget', 'description', 'event_date',
                    'requirements', 'images', 'documents', 'status', 'latitude',
                    'longitude', 'contract_url', 'business_permit_url',
                    'reapplication_cooldown_days'
                ];
                const filteredPayload: any = {};
                for (const key of validGigColumns) {
                    if (insertPayload[key] !== undefined) {
                        filteredPayload[key] = insertPayload[key];
                    }
                }
                insertPayload = filteredPayload;
            }

            const { data, error } = await supabaseClient
                .from(table)
                .insert({ ...insertPayload, [ownerField]: effectiveUserId })
                .select()
                .single()

            if (error) throw error;

            // Studio setup: settings and operating hours
            if (type === 'studio') {
                const studioId = data.id

                const settingsPayload: any = {
                    studio_id: studioId,
                    buffer_minutes: 30,
                    bulk_discount_threshold_hours: 10,
                    bulk_discount_percentage: 0
                };

                if (bookingSettings) {
                    if (bookingSettings.lead_time_hours) settingsPayload.lead_time_hours = parseInt(bookingSettings.lead_time_hours) || 24;
                    if (bookingSettings.weekend_multiplier) settingsPayload.weekend_multiplier = parseFloat(bookingSettings.weekend_multiplier) || 1.0;
                    if (bookingSettings.peak_season_multiplier) settingsPayload.peak_season_multiplier = parseFloat(bookingSettings.peak_season_multiplier) || 1.0;
                    if (bookingSettings.peak_season_dates) settingsPayload.peak_season_dates = bookingSettings.peak_season_dates;
                    if (bookingSettings.off_peak_multiplier) settingsPayload.off_peak_multiplier = parseFloat(bookingSettings.off_peak_multiplier) || 1.0;
                    if (bookingSettings.off_peak_dates) settingsPayload.off_peak_dates = bookingSettings.off_peak_dates;
                }

                await supabaseClient.from('studio_settings').insert(settingsPayload)

                let operatingHours = []

                if (studioAvailability && Array.isArray(studioAvailability) && studioAvailability.length > 0) {
                    const dayMap: { [key: string]: number } = {
                        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
                    };

                    for (const daySchedule of studioAvailability) {
                        const dayIndex = dayMap[daySchedule.day];
                        if (dayIndex !== undefined && daySchedule.slots && daySchedule.slots.length > 0) {
                            daySchedule.slots.forEach((slot: any, slotIndex: number) => {
                                operatingHours.push({
                                    studio_id: studioId,
                                    day_of_week: dayIndex,
                                    is_open: true,
                                    open_time: slot.start,
                                    close_time: slot.end,
                                    slot_order: slotIndex
                                });
                            });
                        }
                    }
                }

                if (operatingHours.length === 0) {
                    for (let day = 0; day <= 6; day++) {
                        operatingHours.push({
                            studio_id: studioId,
                            day_of_week: day,
                            is_open: true,
                            open_time: '09:00',
                            close_time: '22:00'
                        })
                    }
                }

                await supabaseClient.from('studio_operating_hours').insert(operatingHours)

                if (calendarAvailability && Array.isArray(calendarAvailability) && calendarAvailability.length > 0) {
                    const dateOverrides: any[] = [];

                    for (const dateEntry of calendarAvailability) {
                        if (dateEntry.date && dateEntry.slots && dateEntry.slots.length > 0) {
                            const firstSlot = dateEntry.slots[0];
                            dateOverrides.push({
                                studio_id: studioId,
                                override_date: dateEntry.date,
                                is_open: true,
                                open_time: firstSlot.start,
                                close_time: firstSlot.end,
                                reason: 'Custom schedule'
                            });
                        }
                    }

                    if (dateOverrides.length > 0) {
                        await supabaseClient.from('studio_date_overrides').insert(dateOverrides);
                    }
                }
            }

            // Group setup: add owner to group_members
            if (type === 'group') {
                const groupId = data.id;

                await supabaseClient
                    .from('group_members')
                    .insert({
                        group_id: groupId,
                        user_id: effectiveUserId,
                        role: 'owner'
                    });

                const membersArray = insertPayload.members || [];
                if (Array.isArray(membersArray)) {
                    const additionalMembers = membersArray
                        .filter((m: any) => m.user_id && m.user_id !== effectiveUserId)
                        .map((m: any) => ({
                            group_id: groupId,
                            user_id: m.user_id,
                            role: 'member'
                        }));

                    if (additionalMembers.length > 0) {
                        await supabaseClient
                            .from('group_members')
                            .insert(additionalMembers);
                    }
                }
            }

            return new Response(JSON.stringify({ ...data, rating: 0, review_count: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // UPDATE ENTITY
        if (action === 'update') {
            const { type, id, payload } = params
            const table = type + 's'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            let studioAvailability = null;
            let calendarAvailability = null;
            let bookingSettings = null;
            let updatePayload = { ...payload };

            if (type === 'studio') {
                const validStudioColumns = [
                    'name', 'address', 'hourly_rate', 'description', 'amenities',
                    'images', 'latitude', 'longitude', 'rate', 'contract_url',
                    'availability', 'instruments', 'type', 'types', 'rehearsal_rate',
                    'recording_rate', 'open_dates', 'pax', 'business_permit_url'
                ];
                const filteredPayload: any = {};
                for (const key of validStudioColumns) {
                    if (updatePayload[key] !== undefined) {
                        filteredPayload[key] = updatePayload[key];
                    }
                }
                if (updatePayload.calendar_availability) filteredPayload.calendar_availability = updatePayload.calendar_availability;
                if (updatePayload.booking_settings) filteredPayload.booking_settings = updatePayload.booking_settings;
                updatePayload = filteredPayload;
            }

            if (type === 'studio' && updatePayload.availability) {
                studioAvailability = updatePayload.availability;
            }

            if (type === 'studio' && updatePayload.calendar_availability) {
                calendarAvailability = updatePayload.calendar_availability;
                delete updatePayload.calendar_availability;
            }

            if (type === 'studio' && updatePayload.booking_settings) {
                bookingSettings = updatePayload.booking_settings;
                delete updatePayload.booking_settings;
            }

            if (type === 'gig') {
                const validGigColumns = [
                    'name', 'location', 'budget', 'description', 'event_date',
                    'requirements', 'images', 'documents', 'status', 'latitude',
                    'longitude', 'contract_url', 'business_permit_url',
                    'reapplication_cooldown_days'
                ];
                const filteredPayload: any = {};
                for (const key of validGigColumns) {
                    if (updatePayload[key] !== undefined) {
                        filteredPayload[key] = updatePayload[key];
                    }
                }
                updatePayload = filteredPayload;
            }

            const { data, error } = await supabaseClient
                .from(table)
                .update(updatePayload)
                .eq('id', id)
                .eq(ownerField, effectiveUserId)
                .select()
                .single()

            if (error) throw error;

            // Update studio operating hours
            if (type === 'studio' && studioAvailability && Array.isArray(studioAvailability)) {
                const studioId = id;

                await supabaseClient
                    .from('studio_operating_hours')
                    .delete()
                    .eq('studio_id', studioId);

                const dayMap: { [key: string]: number } = {
                    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
                };

                let operatingHours: any[] = [];
                for (const daySchedule of studioAvailability) {
                    const dayIndex = dayMap[daySchedule.day];
                    if (dayIndex !== undefined && daySchedule.slots && daySchedule.slots.length > 0) {
                        daySchedule.slots.forEach((slot: any, slotIndex: number) => {
                            operatingHours.push({
                                studio_id: studioId,
                                day_of_week: dayIndex,
                                is_open: true,
                                open_time: slot.start,
                                close_time: slot.end,
                                slot_order: slotIndex
                            });
                        });
                    }
                }

                if (operatingHours.length > 0) {
                    await supabaseClient.from('studio_operating_hours').insert(operatingHours);
                }
            }

            // Update studio date overrides
            if (type === 'studio' && calendarAvailability && Array.isArray(calendarAvailability)) {
                const studioId = id;

                await supabaseClient
                    .from('studio_date_overrides')
                    .delete()
                    .eq('studio_id', studioId);

                const dateOverrides: any[] = [];

                for (const dateEntry of calendarAvailability) {
                    if (dateEntry.date && dateEntry.slots && dateEntry.slots.length > 0) {
                        const firstSlot = dateEntry.slots[0];
                        dateOverrides.push({
                            studio_id: studioId,
                            override_date: dateEntry.date,
                            is_open: true,
                            open_time: firstSlot.start,
                            close_time: firstSlot.end,
                            reason: 'Custom schedule'
                        });
                    }
                }

                if (dateOverrides.length > 0) {
                    await supabaseClient.from('studio_date_overrides').insert(dateOverrides);
                }
            }

            // Update studio settings
            if (type === 'studio' && bookingSettings) {
                const studioId = id;

                const settingsUpdate: any = {};
                if (bookingSettings.lead_time_hours !== undefined) settingsUpdate.lead_time_hours = parseInt(bookingSettings.lead_time_hours) || 24;
                if (bookingSettings.weekend_multiplier !== undefined) settingsUpdate.weekend_multiplier = parseFloat(bookingSettings.weekend_multiplier) || 1.0;
                if (bookingSettings.peak_season_multiplier !== undefined) settingsUpdate.peak_season_multiplier = parseFloat(bookingSettings.peak_season_multiplier) || 1.0;
                if (bookingSettings.peak_season_dates !== undefined) settingsUpdate.peak_season_dates = bookingSettings.peak_season_dates;
                if (bookingSettings.off_peak_multiplier !== undefined) settingsUpdate.off_peak_multiplier = parseFloat(bookingSettings.off_peak_multiplier) || 1.0;
                if (bookingSettings.off_peak_dates !== undefined) settingsUpdate.off_peak_dates = bookingSettings.off_peak_dates;

                settingsUpdate.updated_at = new Date().toISOString();

                await supabaseClient
                    .from('studio_settings')
                    .update(settingsUpdate)
                    .eq('studio_id', studioId);
            }

            // Sync group_members
            if (type === 'group' && updatePayload.members) {
                const groupId = id;
                const membersArray = updatePayload.members || [];

                if (Array.isArray(membersArray)) {
                    const registeredMembers = membersArray.filter((m: any) => m.user_id);

                    const { data: currentMembers } = await supabaseClient
                        .from('group_members')
                        .select('user_id, role')
                        .eq('group_id', groupId);

                    const currentUserIds = new Set((currentMembers || []).map((m: any) => m.user_id));
                    const newUserIds = new Set(registeredMembers.map((m: any) => m.user_id));

                    const toAdd = registeredMembers
                        .filter((m: any) => !currentUserIds.has(m.user_id))
                        .map((m: any) => ({
                            group_id: groupId,
                            user_id: m.user_id,
                            role: m.role === 'Leader' ? 'owner' : 'member'
                        }));

                    const toRemove = (currentMembers || [])
                        .filter((m: any) => !newUserIds.has(m.user_id) && m.role !== 'owner')
                        .map((m: any) => m.user_id);

                    if (toAdd.length > 0) {
                        await supabaseClient.from('group_members').insert(toAdd);
                    }

                    if (toRemove.length > 0) {
                        await supabaseClient
                            .from('group_members')
                            .delete()
                            .eq('group_id', groupId)
                            .in('user_id', toRemove);
                    }
                }
            }

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // DELETE ENTITY
        if (action === 'delete') {
            const { type, id } = params
            const table = type + 's'

            const { error } = await supabaseClient
                .from(table)
                .delete()
                .eq('id', id)
                .eq(type === 'gig' ? 'organizer_id' : 'owner_id', effectiveUserId)

            if (error) throw error
            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH REVIEWS
        if (action === 'fetch_reviews') {
            const { type, id } = params;
            const field = type + '_id';

            const { data, error } = await supabaseClient
                .from('reviews')
                .select(`
                    *,
                    author:profiles!author_id(full_name, avatar_url)
                `)
                .eq(field, id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
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
