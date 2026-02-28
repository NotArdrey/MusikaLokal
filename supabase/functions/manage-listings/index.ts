// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

const syncStudio3NF = async (client: any, studioId: string) => {
    const { error } = await client.rpc('sync_studio_3nf', { p_studio_id: studioId })
    if (error) throw error
}

const syncGig3NF = async (client: any, gigId: string) => {
    const { error } = await client.rpc('sync_gig_3nf', { p_gig_id: gigId })
    if (error) throw error
}

const replaceGigRequirements = async (client: any, gigId: string, requirements: any) => {
    const { error: deleteError } = await client.from('gig_requirements').delete().eq('gig_id', gigId)
    if (deleteError) throw deleteError

    const safeRequirements = requirements && typeof requirements === 'object' ? requirements : {}
    const payload = Object.entries(safeRequirements)
        .filter(([key]) => (key ?? '').trim().length > 0)
        .map(([key, value]) => ({ gig_id: gigId, requirement_key: key, requirement_value: value }))

    if (payload.length > 0) {
        const { error: insertError } = await client.from('gig_requirements').insert(payload)
        if (insertError) throw insertError
    }
}

const replaceGigMedia = async (client: any, gigId: string, mediaType: 'image' | 'document', urls: string[]) => {
    const { error: deleteError } = await client
        .from('gig_media')
        .delete()
        .eq('gig_id', gigId)
        .eq('media_type', mediaType)
    if (deleteError) throw deleteError

    const payload = (urls || [])
        .map((url) => (url ?? '').trim())
        .filter((url) => url.length > 0)
        .map((url, index) => ({
            gig_id: gigId,
            media_type: mediaType,
            media_url: url,
            sort_order: index,
        }))

    if (payload.length > 0) {
        const { error: insertError } = await client.from('gig_media').insert(payload)
        if (insertError) throw insertError
    }
}

const replaceStudioAmenities = async (client: any, studioId: string, amenities: string[]) => {
    const { error: deleteError } = await client.from('studio_amenities').delete().eq('studio_id', studioId)
    if (deleteError) throw deleteError

    const payload = (amenities || [])
        .map((amenity) => (amenity ?? '').trim())
        .filter((amenity) => amenity.length > 0)
        .map((amenity) => ({ studio_id: studioId, amenity }))

    if (payload.length > 0) {
        const { error: insertError } = await client.from('studio_amenities').insert(payload)
        if (insertError) throw insertError
    }
}

const replaceStudioTypes = async (client: any, studioId: string, types: string[]) => {
    const { error: deleteError } = await client.from('studio_types').delete().eq('studio_id', studioId)
    if (deleteError) throw deleteError

    const payload = (types || [])
        .map((studioType) => (studioType ?? '').trim())
        .filter((studioType) => studioType.length > 0)
        .map((studioType) => ({ studio_id: studioId, studio_type: studioType }))

    if (payload.length > 0) {
        const { error: insertError } = await client.from('studio_types').insert(payload)
        if (insertError) throw insertError
    }
}

const replaceStudioMedia = async (client: any, studioId: string, mediaUrls: string[]) => {
    const { error: deleteError } = await client
        .from('studio_media')
        .delete()
        .eq('studio_id', studioId)
        .eq('media_type', 'image')
    if (deleteError) throw deleteError

    const payload = (mediaUrls || [])
        .map((mediaUrl) => (mediaUrl ?? '').trim())
        .filter((mediaUrl) => mediaUrl.length > 0)
        .map((mediaUrl, index) => ({
            studio_id: studioId,
            media_type: 'image',
            media_url: mediaUrl,
            sort_order: index,
        }))

    if (payload.length > 0) {
        const { error: insertError } = await client.from('studio_media').insert(payload)
        if (insertError) throw insertError
    }
}

const replaceStudioInstruments = async (client: any, studioId: string, instruments: any[]) => {
    const { error: deleteError } = await client.from('studio_instruments').delete().eq('studio_id', studioId)
    if (deleteError) throw deleteError

    const payload = (instruments || [])
        .map((item) => {
            if (item && typeof item === 'object') {
                return {
                    instrument_name: String(item.name ?? item.instrument ?? '').trim(),
                    image_url: item.image ?? item.image_url ?? null,
                }
            }
            return {
                instrument_name: String(item ?? '').trim(),
                image_url: null,
            }
        })
        .filter((item) => item.instrument_name.length > 0)
        .map((item) => ({
            studio_id: studioId,
            instrument_name: item.instrument_name,
            image_url: item.image_url,
        }))

    if (payload.length > 0) {
        const { error: insertError } = await client.from('studio_instruments').insert(payload)
        if (insertError) throw insertError
    }
}

// Helper to decode JWT payload without verification (for getting user ID)
// Uses base64url decoding which is what JWT uses
function decodeJwtPayload(token: string): { sub?: string; email?: string } | null {
    try {
        const parts = token.replace('Bearer ', '').split('.')
        if (parts.length !== 3) return null

        // Base64url to base64 conversion
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        // Add padding if needed
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
        console.log('Authorization header present:', !!authHeader);

        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        // Decode JWT to get user info
        const jwtPayload = decodeJwtPayload(authHeader)
        console.log('JWT payload:', { sub: jwtPayload?.sub, email: jwtPayload?.email });

        if (!jwtPayload || !jwtPayload.sub) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const authenticatedUserId = jwtPayload.sub

        // Create supabase client with service role for database operations
        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )

        const { action, ...params } = await req.json()
        const { userId } = params

        // Verify userId matches authenticated user from JWT
        if (userId && userId !== authenticatedUserId) {
            return new Response(JSON.stringify({ error: 'Forbidden: userId mismatch' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        // Use the authenticated user ID for all operations
        const effectiveUserId = userId || authenticatedUserId

        // CREATE SINGLE NOTIFICATION (server-side)
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

        // CREATE MULTIPLE NOTIFICATIONS (server-side)
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

        // --- FETCH LISTS (MY GIGS, GROUPS, STUDIOS) ---

        // FETCH MY GIGS (using view with computed stats)
        if (action === 'fetch_my_gigs') {
            const { data, error } = await supabaseClient
                .from('gigs_with_stats')
                .select('*')
                .eq('organizer_id', userId)
                .order('created_at', { ascending: false })

            if (error) throw error

            // View columns already named 'rating' and 'review_count'
            const mapped = (data || []).map((item: any) => ({
                ...item,
                rating: item.rating || 0,
                review_count: item.review_count || 0
            }))

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH MY GROUPS (using view with computed stats)
        if (action === 'fetch_my_groups') {
            const { data, error } = await supabaseClient
                .from('groups_with_stats')
                .select('*')
                .eq('owner_id', userId)
                .order('created_at', { ascending: false })

            if (error) throw error

            // View columns already named 'rating' and 'review_count'
            const mapped = (data || []).map((item: any) => ({
                ...item,
                rating: item.rating || 0,
                review_count: item.review_count || 0
            }))

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH MY STUDIOS (using view with computed stats)
        if (action === 'fetch_my_studios') {
            const { data, error } = await supabaseClient
                .from('studios_with_stats')
                .select('*')
                .eq('owner_id', userId)
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

            // View columns already named 'rating' and 'review_count'
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
                    : {
                        booking_settings: null
                    })
            }))

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH SINGLE ENTITY (SECURE) - using view with computed stats
        if (action === 'fetch_one') {
            const { type, id } = params
            const viewName = type + 's_with_stats'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            console.log('📥 Fetching single entity:', { type, id, viewName, ownerField, userId });

            const { data, error } = await supabaseClient
                .from(viewName)
                .select('*')
                .eq('id', id)
                .eq(ownerField, userId)
                .maybeSingle()

            if (error) {
                console.error('❌ Fetch error:', JSON.stringify(error, null, 2));
                throw error;
            }

            console.log('📥 Fetched data:', JSON.stringify(data, null, 2));
            if (type === 'gig' && data) {
                console.log('📦 Gig requirements from DB:', JSON.stringify(data.requirements, null, 2));
            }

            // Return null if not found (user doesn't own this entity or doesn't exist)
            if (!data) {
                console.log('⚠️ No data found for entity');
                return new Response(JSON.stringify(null), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
            }

            // If studio, also fetch operating hours and convert to availability format
            if (type === 'studio') {
                const { data: operatingHours, error: hoursError } = await supabaseClient
                    .from('studio_operating_hours')
                    .select('*')
                    .eq('studio_id', id)
                    .order('slot_order', { ascending: true });

                if (!hoursError && operatingHours) {
                    // Convert operating hours to availability format
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

            // View columns already named 'rating' and 'review_count'
            const mapped = {
                ...data,
                rating: data.rating || 0,
                review_count: data.review_count || 0
            }

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // CREATE ENTITY (uses base table for inserts)
        if (action === 'create') {
            const { type, payload } = params
            const table = type + 's'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            // Extract availability only if type is studio, to prevent it from being sent to studios table insert
            let studioAvailability = null;
            let calendarAvailability = null;
            let bookingSettings = null;
            let insertPayload = { ...payload };

            // For studios, only allow valid columns to prevent PGRST204 errors
            // This filters out any extra fields that don't exist in the studios table
            if (type === 'studio') {
                const validStudioColumns = [
                    'name', 'address', 'hourly_rate', 'description',
                    'latitude', 'longitude', 'rate', 'contract_url',
                    'availability', 'rehearsal_rate',
                    'recording_rate', 'open_dates', 'pax', 'business_permit_url'
                ];
                const filteredPayload: any = {};
                for (const key of validStudioColumns) {
                    if (insertPayload[key] !== undefined) {
                        filteredPayload[key] = insertPayload[key];
                    }
                }
                // Preserve special fields for later processing
                if (insertPayload.calendar_availability) filteredPayload.calendar_availability = insertPayload.calendar_availability;
                if (insertPayload.booking_settings) filteredPayload.booking_settings = insertPayload.booking_settings;
                insertPayload = filteredPayload;
            }

            // SPAM PREVENTION & SLOT CHECKING: Check for blocking rules for Gig Applications
            if (type === 'gig_application') {
                const { gig_id, slot_type } = insertPayload;

                // 1. Fetch gig settings for cooldown and slot tracking
                const { data: gigData, error: gigError } = await supabaseClient
                    .from('gigs')
                    .select('reapplication_cooldown_days, slots_filled, total_slots_filled, status')
                    .eq('id', gig_id)
                    .single();

                const { data: gigLegacyProjection, error: gigLegacyProjectionError } = await supabaseClient
                    .from('gigs_legacy_projection')
                    .select('requirements')
                    .eq('id', gig_id)
                    .single();

                if (gigError) throw gigError;
                if (gigLegacyProjectionError) throw gigLegacyProjectionError;

                const gigRequirements = gigLegacyProjection?.requirements || {};

                // 2. Check if gig is still open
                if (gigData.status !== 'open') {
                    throw new Error('This gig is no longer accepting applications.');
                }

                // 3. Check slot availability
                const totalSlotsNeeded = gigRequirements?.total_slots_needed || 999;
                const totalSlotsFilled = gigData.total_slots_filled || 0;
                
                if (totalSlotsFilled >= totalSlotsNeeded) {
                    throw new Error('All performer slots for this gig have been filled.');
                }

                // Check specific slot type availability if provided
                if (slot_type && gigRequirements?.slots?.[slot_type]) {
                    const slotNeeded = gigRequirements.slots[slot_type]?.needed || 0;
                    const slotFilled = gigData.slots_filled?.[slot_type]?.accepted || 0;
                    
                    if (slotNeeded > 0 && slotFilled >= slotNeeded) {
                        throw new Error(`All ${slot_type} slots have been filled. Try applying for a different slot type.`);
                    }
                }

                // 4. Check if user already has a pending or accepted application for this gig
                const { data: existingApp, error: existingError } = await supabaseClient
                    .from('gig_applications')
                    .select('id, status')
                    .eq('applicant_id', userId)
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

                // 5. Check cooldown for rejected applications
                const cooldownDays = gigData.reapplication_cooldown_days ?? 30; // Default 30 days if not set
                
                if (cooldownDays > 0) {
                    const { data: rejectedApp, error: rejectedError } = await supabaseClient
                        .from('gig_applications')
                        .select('id, rejected_at, created_at')
                        .eq('applicant_id', userId)
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

                console.log('✅ Application checks passed - user can apply');
            }


            if (type === 'studio' && insertPayload.availability) {
                studioAvailability = insertPayload.availability;
                delete insertPayload.availability; // Remove from payload so it doesn't fail insert
            }

            // Extract calendar_availability (specific date overrides)
            if (type === 'studio' && insertPayload.calendar_availability) {
                calendarAvailability = insertPayload.calendar_availability;
                delete insertPayload.calendar_availability; // Remove from payload so it doesn't fail insert
            }

            // Extract booking_settings for studio
            if (type === 'studio' && insertPayload.booking_settings) {
                bookingSettings = insertPayload.booking_settings;
                delete insertPayload.booking_settings; // Remove from payload so it doesn't fail insert
            }

            // Log gig requirements if creating a gig
            if (type === 'gig') {
                console.log('📦 Creating gig with requirements:', JSON.stringify(insertPayload.requirements, null, 2));
                
                // For gigs, only allow valid columns to prevent PGRST204 errors
                const validGigColumns = [
                    'name', 'location', 'budget', 'description', 'event_date',
                    'status', 'latitude',
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

            console.log('📤 Inserting into table:', table);
            console.log('📤 Insert payload:', JSON.stringify(insertPayload, null, 2));

            const { data, error } = await supabaseClient
                .from(table)
                .insert({ ...insertPayload, [ownerField]: userId })
                .select()
                .single()

            if (error) {
                console.error('❌ Insert error:', JSON.stringify(error, null, 2));
                throw error;
            }

            console.log('✅ Insert successful, returned data:', JSON.stringify(data, null, 2));

            // If creating a studio, create operating hours and settings
            if (type === 'studio') {
                const studioId = data.id

                // Create studio settings with user provided values or defaults
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

                // Create operating hours
                let operatingHours = []

                if (studioAvailability && Array.isArray(studioAvailability) && studioAvailability.length > 0) {
                    // Map user provided availability
                    // Frontend format: { day: 'Monday', slots: [{start, end}] }
                    // DB format: day_of_week (0-6), open_time, close_time
                    // Support multiple slots per day

                    const dayMap: { [key: string]: number } = {
                        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
                    };

                    for (const daySchedule of studioAvailability) {
                        const dayIndex = dayMap[daySchedule.day];
                        if (dayIndex !== undefined && daySchedule.slots && daySchedule.slots.length > 0) {
                            // Insert ALL slots for this day (not just first and last)
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

                // If no availability provided or parsed, use defaults
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

                // Insert calendar-based date overrides (specific dates)
                if (calendarAvailability && Array.isArray(calendarAvailability) && calendarAvailability.length > 0) {
                    const dateOverrides: any[] = [];

                    for (const dateEntry of calendarAvailability) {
                        if (dateEntry.date && dateEntry.slots && dateEntry.slots.length > 0) {
                            // For each slot in the date, create an override entry
                            // The table supports one slot per date, so we'll use the first slot's times
                            // For multiple slots, we use the earliest start and latest end
                            const allStarts = dateEntry.slots.map((s: any) => s.start);
                            const allEnds = dateEntry.slots.map((s: any) => s.end);

                            // Use first slot for now (can be extended for multiple slots per date)
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
                        console.log(`📅 Inserted ${dateOverrides.length} date overrides for studio ${studioId}`);
                    }
                }
            }

            // If creating a group, add owner to group_members table
            if (type === 'group') {
                const groupId = data.id;

                // Insert owner as a member with 'owner' role
                const { error: memberError } = await supabaseClient
                    .from('group_members')
                    .insert({
                        group_id: groupId,
                        user_id: userId,
                        role: 'owner'
                    });

                if (memberError) {
                    console.error('⚠️ Failed to add owner to group_members:', memberError);
                } else {
                    console.log(`👤 Added owner ${userId} to group_members for group ${groupId}`);
                }

                // Also add any other members that have user_id in the members JSONB array
                const membersArray = insertPayload.members || [];
                if (Array.isArray(membersArray)) {
                    const additionalMembers = membersArray
                        .filter((m: any) => m.user_id && m.user_id !== userId) // Exclude owner (already added)
                        .map((m: any) => ({
                            group_id: groupId,
                            user_id: m.user_id,
                            role: 'member'
                        }));

                    if (additionalMembers.length > 0) {
                        const { error: additionalError } = await supabaseClient
                            .from('group_members')
                            .insert(additionalMembers);

                        if (additionalError) {
                            console.error('⚠️ Failed to add additional members:', additionalError);
                        } else {
                            console.log(`👥 Added ${additionalMembers.length} additional members to group_members`);
                        }
                    }
                }
            }

            if (type === 'studio') {
                const sourceAmenities = Array.isArray(payload?.amenities) ? payload.amenities : [];
                const sourceImages = Array.isArray(payload?.images) ? payload.images : [];
                const sourceTypes = Array.isArray(payload?.types)
                    ? payload.types
                    : (payload?.type ? [payload.type] : []);
                const sourceInstruments = Array.isArray(payload?.instruments) ? payload.instruments : [];

                await syncStudio3NF(supabaseClient, data.id)
                await replaceStudioAmenities(supabaseClient, data.id, sourceAmenities)
                await replaceStudioMedia(supabaseClient, data.id, sourceImages)
                await replaceStudioTypes(supabaseClient, data.id, sourceTypes)
                await replaceStudioInstruments(supabaseClient, data.id, sourceInstruments)
            }

            if (type === 'gig') {
                const sourceRequirements = payload?.requirements
                const sourceImages = Array.isArray(payload?.images) ? payload.images : []
                const sourceDocuments = Array.isArray(payload?.documents) ? payload.documents : []

                await syncGig3NF(supabaseClient, data.id)
                await replaceGigRequirements(supabaseClient, data.id, sourceRequirements)
                await replaceGigMedia(supabaseClient, data.id, 'image', sourceImages)
                await replaceGigMedia(supabaseClient, data.id, 'document', sourceDocuments)
            }

            // Return with default stats for new entity
            return new Response(JSON.stringify({ ...data, rating: 0, review_count: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // UPDATE ENTITY (uses base table for updates)
        if (action === 'update') {
            const { type, id, payload } = params
            const table = type + 's'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            // Handle availability for studios - store in operating_hours table
            let studioAvailability = null;
            let calendarAvailability = null;
            let bookingSettings = null;
            let updatePayload = { ...payload };

            // For studios, only allow valid columns to prevent PGRST204 errors
            // This filters out any extra fields that don't exist in the studios table
            if (type === 'studio') {
                const validStudioColumns = [
                    'name', 'address', 'hourly_rate', 'description',
                    'images', 'latitude', 'longitude', 'rate', 'contract_url',
                    'availability', 'rehearsal_rate',
                    'recording_rate', 'open_dates', 'pax', 'business_permit_url'
                ];
                const filteredPayload: any = {};
                for (const key of validStudioColumns) {
                    if (updatePayload[key] !== undefined) {
                        filteredPayload[key] = updatePayload[key];
                    }
                }
                // Preserve special fields for later processing
                if (updatePayload.calendar_availability) filteredPayload.calendar_availability = updatePayload.calendar_availability;
                if (updatePayload.booking_settings) filteredPayload.booking_settings = updatePayload.booking_settings;
                updatePayload = filteredPayload;
            }

            if (type === 'studio' && updatePayload.availability) {
                studioAvailability = updatePayload.availability;
                // Keep availability in payload if column exists in table
                // If you want to use normalized tables instead, uncomment the line below:
                // delete updatePayload.availability;
            }

            // Extract calendar_availability (specific date overrides)
            if (type === 'studio' && updatePayload.calendar_availability) {
                calendarAvailability = updatePayload.calendar_availability;
                delete updatePayload.calendar_availability; // Remove from payload so it doesn't fail update
            }

            // Extract booking_settings for studio
            if (type === 'studio' && updatePayload.booking_settings) {
                bookingSettings = updatePayload.booking_settings;
                delete updatePayload.booking_settings; // Remove from payload so it doesn't fail update
            }

            // Log gig requirements if updating a gig
            if (type === 'gig') {
                console.log('📦 Updating gig with requirements:', JSON.stringify(updatePayload.requirements, null, 2));

                const validGigColumns = [
                    'name', 'location', 'budget', 'description', 'event_date',
                    'status', 'latitude',
                    'longitude', 'contract_url', 'business_permit_url',
                    'reapplication_cooldown_days'
                ];
                const filteredPayload: any = {};
                for (const key of validGigColumns) {
                    if (updatePayload[key] !== undefined) {
                        filteredPayload[key] = updatePayload[key];
                    }
                }

                const { data: rpcData, error: rpcError } = await supabaseClient.rpc('update_gig_safely', {
                    p_gig_id: id,
                    p_payload: filteredPayload,
                    p_reason: 'Updated via manage-listings edge function',
                });

                if (rpcError) {
                    console.error('❌ Gig update RPC error:', JSON.stringify(rpcError, null, 2));
                    throw rpcError;
                }

                const rpcResult: any = rpcData;
                if (!rpcResult?.success) {
                    return new Response(JSON.stringify(rpcResult), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 409,
                    });
                }

                const sourceRequirements = payload?.requirements
                const sourceImages = Array.isArray(payload?.images) ? payload.images : []
                const sourceDocuments = Array.isArray(payload?.documents) ? payload.documents : []

                await syncGig3NF(supabaseClient, id)
                if (sourceRequirements !== undefined) {
                    await replaceGigRequirements(supabaseClient, id, sourceRequirements)
                }
                if (payload?.images !== undefined) {
                    await replaceGigMedia(supabaseClient, id, 'image', sourceImages)
                }
                if (payload?.documents !== undefined) {
                    await replaceGigMedia(supabaseClient, id, 'document', sourceDocuments)
                }

                return new Response(JSON.stringify(rpcResult.gig), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                });
            }

            console.log('📤 Updating table:', table);
            console.log('📤 Update payload:', JSON.stringify(updatePayload, null, 2));
            console.log('📤 Entity ID:', id);

            const { data, error } = await supabaseClient
                .from(table)
                .update(updatePayload)
                .eq('id', id)
                .eq(ownerField, userId)
                .select()
                .single()

            if (error) {
                console.error('❌ Update error:', JSON.stringify(error, null, 2));
                throw error;
            }

            console.log('✅ Update successful, returned data:', JSON.stringify(data, null, 2));
            if (type === 'gig') {
                console.log('✅ Gig requirements after update:', JSON.stringify(data.requirements, null, 2));
            }

            // Update studio operating hours if availability was provided
            if (type === 'studio' && studioAvailability && Array.isArray(studioAvailability)) {
                const studioId = id;

                // Delete existing operating hours for this studio
                await supabaseClient
                    .from('studio_operating_hours')
                    .delete()
                    .eq('studio_id', studioId);

                // Create new operating hours
                const dayMap: { [key: string]: number } = {
                    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
                };

                let operatingHours: any[] = [];
                for (const daySchedule of studioAvailability) {
                    const dayIndex = dayMap[daySchedule.day];
                    if (dayIndex !== undefined && daySchedule.slots && daySchedule.slots.length > 0) {
                        // Insert ALL slots for this day (not just first and last)
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

            // Update studio date overrides if calendar_availability was provided
            if (type === 'studio' && calendarAvailability && Array.isArray(calendarAvailability)) {
                const studioId = id;

                // Delete existing date overrides for this studio
                await supabaseClient
                    .from('studio_date_overrides')
                    .delete()
                    .eq('studio_id', studioId);

                // Insert new date overrides
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
                    console.log(`📅 Updated ${dateOverrides.length} date overrides for studio ${studioId}`);
                }
            }

            // Update studio settings if booking_settings was provided
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

                const { error: settingsError } = await supabaseClient
                    .from('studio_settings')
                    .update(settingsUpdate)
                    .eq('studio_id', studioId);

                if (settingsError) {
                    console.error('⚠️ Failed to update studio settings:', settingsError);
                } else {
                    console.log('⚙️ Updated studio settings:', settingsUpdate);
                }
            }

            // Sync group_members when updating a group with members that have user_id
            if (type === 'group' && updatePayload.members) {
                const groupId = id;
                const membersArray = updatePayload.members || [];

                if (Array.isArray(membersArray)) {
                    // Get members with user_id (registered users)
                    const registeredMembers = membersArray.filter((m: any) => m.user_id);

                    // Get current group_members entries
                    const { data: currentMembers } = await supabaseClient
                        .from('group_members')
                        .select('user_id, role')
                        .eq('group_id', groupId);

                    const currentUserIds = new Set((currentMembers || []).map((m: any) => m.user_id));
                    const newUserIds = new Set(registeredMembers.map((m: any) => m.user_id));

                    // Find members to add (in new list but not in current)
                    const toAdd = registeredMembers
                        .filter((m: any) => !currentUserIds.has(m.user_id))
                        .map((m: any) => ({
                            group_id: groupId,
                            user_id: m.user_id,
                            role: m.role === 'Leader' ? 'owner' : 'member'
                        }));

                    // Find members to remove (in current but not in new, except owner)
                    const ownerIds = (currentMembers || [])
                        .filter((m: any) => m.role === 'owner')
                        .map((m: any) => m.user_id);

                    const toRemove = (currentMembers || [])
                        .filter((m: any) => !newUserIds.has(m.user_id) && m.role !== 'owner')
                        .map((m: any) => m.user_id);

                    // Add new members
                    if (toAdd.length > 0) {
                        const { error: addError } = await supabaseClient
                            .from('group_members')
                            .insert(toAdd);

                        if (addError) {
                            console.error('⚠️ Failed to add group members:', addError);
                        } else {
                            console.log(`👥 Added ${toAdd.length} members to group_members`);
                        }
                    }

                    // Remove members that are no longer in the list
                    if (toRemove.length > 0) {
                        const { error: removeError } = await supabaseClient
                            .from('group_members')
                            .delete()
                            .eq('group_id', groupId)
                            .in('user_id', toRemove);

                        if (removeError) {
                            console.error('⚠️ Failed to remove group members:', removeError);
                        } else {
                            console.log(`👥 Removed ${toRemove.length} members from group_members`);
                        }
                    }
                }
            }

            if (type === 'studio') {
                const sourceAmenities = payload?.amenities
                const sourceTypes = payload?.types !== undefined
                    ? payload?.types
                    : (payload?.type !== undefined ? [payload?.type] : undefined)
                const sourceInstruments = payload?.instruments

                await syncStudio3NF(supabaseClient, id)
                if (sourceAmenities !== undefined) {
                    await replaceStudioAmenities(supabaseClient, id, sourceAmenities)
                }
                if (payload?.images !== undefined) {
                    await replaceStudioMedia(supabaseClient, id, payload.images)
                }
                if (sourceTypes !== undefined) {
                    await replaceStudioTypes(supabaseClient, id, sourceTypes)
                }
                if (sourceInstruments !== undefined) {
                    await replaceStudioInstruments(supabaseClient, id, sourceInstruments)
                }
            }

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // DELETE ENTITY (uses base table for deletes)
        if (action === 'delete') {
            const { type, id } = params // type: 'gig', 'group', 'studio'

            if (type === 'gig') {
                const { data: rpcData, error: rpcError } = await supabaseClient.rpc('delete_gig_safely', {
                    p_gig_id: id,
                    p_reason: 'Deleted via manage-listings edge function',
                });

                if (rpcError) throw rpcError;

                const rpcResult: any = rpcData;
                if (!rpcResult?.success) {
                    return new Response(JSON.stringify(rpcResult), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 409,
                    });
                }

                return new Response(JSON.stringify({ success: true, ...rpcResult }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                });
            }

            const table = type + 's'

            const { error } = await supabaseClient
                .from(table)
                .delete()
                .eq('id', id)
                .eq(type === 'gig' ? 'organizer_id' : 'owner_id', userId) // Security check

            if (error) throw error
            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // --- MANAGE DASHBOARD ACTIONS ---

        // FETCH STUDIO BOOKINGS
        if (action === 'fetch_studio_bookings') {
            const { studioId } = params;
            // Join with profiles to get user info
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

        // FETCH GIG APPLICATIONS
        if (action === 'fetch_gig_applications') {
            const { gigId } = params;
            const { data, error } = await supabaseClient
                .from('gig_applications')
                .select(`
                    *,
                    applicant:profiles!applicant_id(id, full_name, avatar_url, role, skills, genres, bio, location, portfolio_urls),
                    group:groups!group_id(id, name, genre, images, members, description, location, rate)
                `)
                .eq('gig_id', gigId)
                .or('leader_approval_status.is.null,leader_approval_status.eq.approved')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // FETCH GROUP APPLICATIONS (My applications as a group/musician)
        if (action === 'fetch_group_applications') {
            const { groupId } = params;
            // Fetch applications where group_id matches OR applicant_id matches the user (if personal)
            // Prioritize group_id if provided
            let query = supabaseClient.from('gig_applications').select(`
                *,
                gig:gigs!gig_id(name, location, budget, event_date, status, images)
             `);

            if (groupId) {
                query = query.eq('group_id', groupId);
            } else {
                query = query.eq('applicant_id', userId);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // UPDATE BOOKING STATUS (Studio Bookings)
        if (action === 'update_booking_status') {
            const { bookingId, status, cancellation_reason } = params;

            // First get the booking details to send notification
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

            // Update the booking status (and cancellation reason if provided)
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

            // Send notification to the user who made the booking
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

            // Insert notification for the user
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

        // PARTIAL SLOT APPROVAL (For multi-slot bookings)
        if (action === 'partial_slot_approval') {
            const { bookingId, acceptedSlots, declinedSlots, cancellation_reason } = params;

            // First get the booking details
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

            // If there are accepted slots, update the original booking with only accepted slots
            if (acceptedSlots && acceptedSlots.length > 0) {
                // Calculate new pricing for accepted slots
                let totalHours = 0;
                for (const slot of acceptedSlots) {
                    const [startH, startM] = slot.start.split(':').map(Number);
                    const [endH, endM] = slot.end.split(':').map(Number);
                    const hours = (endH + endM / 60) - (startH + startM / 60);
                    totalHours += hours;
                }
                const newPrice = totalHours * hourlyRate;

                // Get overall start and end for backwards compatibility
                const allStartTimes = acceptedSlots.map((s: any) => s.start).sort();
                const allEndTimes = acceptedSlots.map((s: any) => s.end).sort();
                const overallStart = allStartTimes[0];
                const overallEnd = allEndTimes[allEndTimes.length - 1];

                // Update the booking with only accepted slots
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

                // Send notification about partial approval
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
                // All slots declined - just cancel the booking
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

        // UPDATE APPLICATION STATUS
        if (action === 'update_application_status') {
            const { applicationId, status } = params;

            // First get the application details to send notification
            const { data: appDetails, error: appError } = await supabaseClient
                .from('gig_applications')
                .select(`
                    *,
                    gig:gig_id(name, organizer_id),
                    applicant:applicant_id(full_name),
                    group:group_id(name)
                `)
                .eq('id', applicationId)
                .single();

            if (appError) throw appError;

            // Update the application status
            const updatePayload: Record<string, any> = { status };
            if (status === 'accepted') {
                updatePayload.system_status_reason = null;
                updatePayload.reconfirmation_required_at = null;
                updatePayload.reconfirmation_due_at = null;
            } else if (status === 'rejected') {
                updatePayload.system_status_reason = 'user_rejection';
                updatePayload.reconfirmation_required_at = null;
                updatePayload.reconfirmation_due_at = null;
            }

            const { data, error } = await supabaseClient
                .from('gig_applications')
                .update(updatePayload)
                .eq('id', applicationId)
                .select()
                .single();

            if (error) throw error;

            // Send notification to the applicant
            const applicantName = appDetails.group?.name || appDetails.applicant?.full_name || 'Applicant';
            const gigName = appDetails.gig?.name || 'the gig';

            let notificationType = 'info';
            let notificationTitle = '';
            let notificationMessage = '';

            if (status === 'rejected') {
                notificationType = 'warning';
                notificationTitle = 'Application Declined';
                notificationMessage = `Your application for "${gigName}" has been declined.`;
            } else if (status === 'accepted') {
                notificationType = 'success';
                notificationTitle = 'Application Accepted! 🎉';
                notificationMessage = `Congratulations! Your application for "${gigName}" has been accepted.`;
            }

            // Insert notification for the applicant
            if (notificationTitle) {
                await supabaseClient
                    .from('notifications')
                    .insert({
                        user_id: appDetails.applicant_id,
                        type: notificationType,
                        title: notificationTitle,
                        message: notificationMessage,
                        meta: {
                            gig_id: appDetails.gig_id,
                            application_id: applicationId,
                            status: status,
                            status_reason: status === 'rejected' ? 'user_rejection' : null
                        }
                    });
            }

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // FETCH REVIEWS
        if (action === 'fetch_reviews') {
            const { type, id } = params; // type: 'studio', 'gig', 'group'
            const field = type + '_id'; // e.g., studio_id

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

        // FETCH MY BOOKINGS (Studio Bookings made by the user)
        if (action === 'fetch_my_bookings') {
            // Join with studio to get studio details
            const { data, error } = await supabaseClient
                .from('studio_bookings')
                .select(`
                    *,
                    studio:studios!studio_id(name, images, location, rate_per_hour)
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // CHECK ELIGIBILITY (Spam Block Check)
        if (action === 'check_eligibility') {
            const { gigId } = params; // Changed from organizerId to gigId

            if (!gigId) {
                return new Response(JSON.stringify({ blocked: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
            }

            // Count cancellations for THIS gig in last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const { count, error: countError } = await supabaseClient
                .from('gig_applications')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'cancelled')
                .eq('applicant_id', userId)
                .eq('gig_id', gigId) // Scoped to gig
                .gte('updated_at', thirtyDaysAgo.toISOString());

            if (countError) throw countError;

            const blocked = (count || 0) >= 3;
            return new Response(JSON.stringify({
                blocked,
                reason: blocked ? 'Maximum attempts reached for this gig.' : null
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // CANCEL APPLICATION
        if (action === 'cancel_application') {
            const { applicationId } = params;

            // Verify ownership securely
            const { data: existingApp, error: fetchError } = await supabaseClient
                .from('gig_applications')
                .select('applicant_id, group_id, group:groups!group_id(owner_id)')
                .eq('id', applicationId)
                .single();

            if (fetchError) throw fetchError;
            if (!existingApp) throw new Error('Application not found');

            // Check if consumer is the applicant (individual) OR the owner of the group
            const isApplicant = existingApp.applicant_id === userId;
            const isGroupOwner = existingApp.group?.owner_id === userId;

            if (!isApplicant && !isGroupOwner) {
                return new Response(JSON.stringify({ error: 'Unauthorized to cancel this application' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            // Soft delete: Update status to 'cancelled'
            const { error: updateError } = await supabaseClient
                .from('gig_applications')
                .update({ status: 'cancelled' })
                .eq('id', applicationId);

            if (updateError) throw updateError;

            // SPAM PREVENTION: Get count to show to user
            let cancellationCount = 0;
            try {
                // Get gig details from existingApp (need to ensure gig_id was fetched)
                // We initially only fetched select('applicant_id, group_id...').
                // Let's refetch or improve initial fetch.
                // Improvement: Update initial fetch to include gig_id
            } catch (e) {
                // Ignore count error, just return success
            }

            // To do this cleanly, let's just fetch the gig_id via the existingApp logic if we update the SELECT above.
            // But since I can't easily jump back and forth with one replace, I'll do a fresh small query or assume existingApp has it (I will update the SELECT in the next chunk).

            // Re-fetch gig info for counting
            const { data: appData } = await supabaseClient
                .from('gig_applications')
                .select('gig_id') // We know this app exists
                .eq('id', applicationId)
                .single();

            if (appData?.gig_id) {
                const { data: gigData } = await supabaseClient
                    .from('gigs')
                    .select('organizer_id')
                    .eq('id', appData.gig_id)
                    .single();

                if (gigData) {
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                    const { count } = await supabaseClient
                        .from('gig_applications')
                        .select('id, gig:gigs!inner(organizer_id)', { count: 'exact', head: true })
                        .eq('status', 'cancelled')
                        .eq('applicant_id', userId)
                        .eq('gig.organizer_id', gigData.organizer_id)
                        .gte('updated_at', thirtyDaysAgo.toISOString());

                    cancellationCount = count || 0;
                }
            }

            return new Response(JSON.stringify({ success: true, cancellation_count: cancellationCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // --- GROUP MEMBER MANAGEMENT ---

        // FETCH GROUP MEMBERS (from group_members table with profile info)
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

        // ADD MEMBER TO GROUP (by user_id)
        if (action === 'add_group_member') {
            const { groupId, targetUserId, memberRole } = params;

            if (!groupId || !targetUserId) {
                return new Response(JSON.stringify({ error: 'Missing groupId or targetUserId' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Verify the requester is the owner of the group
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

            // Check if user is already a member
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

            // Add the member
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

            // Notify the new member
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

            // Verify the requester is the owner of the group
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

            // Allow owner to remove members, or member to leave the group (self-removal)
            if (group.owner_id !== effectiveUserId && targetUserId !== effectiveUserId) {
                return new Response(JSON.stringify({ error: 'Only the group owner can remove members, or members can leave themselves' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            // Prevent owner from removing themselves (they must transfer leadership first)
            if (targetUserId === group.owner_id) {
                return new Response(JSON.stringify({ error: 'The group owner cannot be removed. Transfer leadership first.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Remove the member
            const { error } = await supabaseClient
                .from('group_members')
                .delete()
                .eq('group_id', groupId)
                .eq('user_id', targetUserId);

            if (error) throw error;

            // Notify the removed member (if removed by owner)
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

            // Verify the requester is the owner
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

            // Cannot change owner's role via this action (use leadership transfer)
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
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));

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
