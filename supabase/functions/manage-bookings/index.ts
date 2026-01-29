// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const { action, ...params } = await req.json()

        // 1. FETCH BOOKINGS & APPLICATIONS
        if (action === 'fetch') {
            const { userId } = params

            // First, get user role to determine what to fetch
            const { data: profile, error: profileError } = await supabaseClient
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single()

            if (profileError) throw profileError

            const userRole = profile?.role

            const categorized = {
                Pending: [],
                Upcoming: [],
                Ongoing: [],
                Review: []
            }

            const now = new Date()

            // A. For Musicians: Fetch their Studio Bookings as customers
            if (userRole === 'musician') {
                const { data: bookings, error: bookingError } = await supabaseClient
                    .from('studio_bookings_with_cost')
                    .select('*')
                    .eq('user_id', userId)
                    .order('booking_date', { ascending: false })

                if (bookingError) throw bookingError

                // Process Studio Bookings
                // @ts-ignore
                bookings?.forEach((b: any) => {
                    const bookingDate = new Date(`${b.booking_date}T${b.start_time}`)
                    const endDate = new Date(`${b.booking_date}T${b.end_time}`)

                    const item = {
                        id: b.id,
                        type_id: 'studio_booking',
                        studio_id: b.studio_id,
                        user_id: b.user_id,
                        raw_date: b.booking_date,
                        start_time: b.start_time,
                        end_time: b.end_time,
                        name: b.studio_name || 'Unknown Studio',
                        date: `${b.booking_date} • ${b.start_time} - ${b.end_time}`,
                        image: b.studio_images?.[0] || 'https://picsum.photos/400/300',
                        status: b.status === 'pending' ? 'Waiting for Approval' :
                            b.status === 'confirmed' ? 'Confirmed' :
                                b.status === 'cancelled' ? 'Declined' : b.status,
                        type: 'Studio Booking',
                        isCancelled: b.status === 'cancelled',
                        action: b.status === 'pending' ? 'View Details' : 'Details',
                        duration_hours: b.duration_hours,
                        total_cost: b.total_cost,
                        notes: b.notes,
                        reviewed_by_customer: b.reviewed_by_customer || false,
                        reviewed_by_owner: b.reviewed_by_owner || false,
                        proof_url: b.proof_url
                    }

                    if (b.status === 'pending') {
                        // @ts-ignore
                        categorized.Pending.push(item)
                    } else if (b.status === 'confirmed') {
                        if (now >= bookingDate && now <= endDate) {
                            // @ts-ignore
                            categorized.Ongoing.push({ ...item, status: 'In Progress' })
                        } else if (now > endDate) {
                            // Only show in Review if not yet reviewed by customer
                            if (!b.reviewed_by_customer) {
                                // @ts-ignore
                                categorized.Review.push({ ...item, status: 'Completed' })
                            }
                        } else {
                            // @ts-ignore
                            categorized.Upcoming.push(item)
                        }
                    } else if (b.status === 'cancelled') {
                        // @ts-ignore
                        categorized.Upcoming.push(item)
                    }
                })
            }

            // B. For Studio Owners: Fetch bookings for THEIR studios
            if (userRole === 'studio-owner') {
                // First get their studios
                const { data: studios } = await supabaseClient
                    .from('studios')
                    .select('id')
                    .eq('owner_id', userId)

                const studioIds = studios?.map((s: any) => s.id) || []

                if (studioIds.length > 0) {
                    const { data: bookings, error: bookingError } = await supabaseClient
                        .from('studio_bookings')
                        .select('*, studio:studios(name, images), profile:user_id(full_name, avatar_url, email)')
                        .in('studio_id', studioIds)
                        .order('booking_date', { ascending: false })

                    if (bookingError) throw bookingError

                    // Process Studio Bookings
                    // @ts-ignore
                    bookings?.forEach((b: any) => {
                        const bookingDate = new Date(`${b.booking_date}T${b.start_time}`)
                        const endDate = new Date(`${b.booking_date}T${b.end_time}`)

                        const customerName = b.profile?.full_name || b.profile?.email || 'Guest'
                        const customerAvatar = b.profile?.avatar_url || 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop'

                        const item = {
                            id: b.id,
                            type_id: 'studio_booking',
                            studio_id: b.studio_id,
                            user_id: b.user_id,  // The musician who booked
                            raw_date: b.booking_date,
                            start_time: b.start_time,
                            end_time: b.end_time,
                            name: `${b.studio?.name} - ${customerName}`,
                            date: `${b.booking_date} • ${b.start_time} - ${b.end_time}`,
                            image: b.studio?.images?.[0] || 'https://picsum.photos/400/300',
                            status: b.status === 'pending' ? 'User Request' :
                                b.status === 'confirmed' ? 'Confirmed' :
                                    b.status === 'cancelled' ? 'Declined' : b.status,
                            type: 'Studio Booking',
                            isCancelled: b.status === 'cancelled',
                            action: b.status === 'pending' ? 'Confirm Now' : 'Details',
                            duration_hours: b.hours, // Use stored column
                            total_cost: b.final_price, // Use stored column
                            studio_name: b.studio?.name,
                            notes: b.notes,
                            customer_name: customerName,
                            customer_avatar: customerAvatar,
                            reviewed_by_customer: b.reviewed_by_customer || false,
                            reviewed_by_owner: b.reviewed_by_owner || false,
                            proof_url: b.proof_url
                        }

                        if (b.status === 'pending') {
                            // @ts-ignore
                            categorized.Pending.push(item)
                        } else if (b.status === 'confirmed') {
                            if (now >= bookingDate && now <= endDate) {
                                // @ts-ignore
                                categorized.Ongoing.push({ ...item, status: 'In Progress' })
                            } else if (now > endDate) {
                                // Only show in Review if not yet reviewed by owner
                                if (!b.reviewed_by_owner) {
                                    // @ts-ignore
                                    categorized.Review.push({ ...item, status: 'Completed' })
                                }
                            } else {
                                // @ts-ignore
                                categorized.Upcoming.push(item)
                            }
                        } else if (b.status === 'cancelled') {
                            // @ts-ignore
                            categorized.Upcoming.push(item)
                        }
                    })
                }
            }

            // C. For Musicians: Fetch Gig Applications
            if (userRole === 'musician') {
                const { data: gigApps, error: gigError } = await supabaseClient
                    .from('gig_applications')
                    .select('*, gig:gig_id(name, event_date, images, location)')
                    .eq('applicant_id', userId)
                    .order('created_at', { ascending: false })

                if (gigError) {
                    console.log('Error fetching gig apps:', gigError)
                }

                // Process Gig Applications
                // @ts-ignore
                gigApps?.forEach((g: any) => {
                    const gig = g.gig
                    const dateStr = gig?.event_date || g.created_at?.split('T')[0] || 'TBA'

                    // Parse event date for time-based categorization
                    let eventDate: Date | null = null
                    if (gig?.event_date) {
                        eventDate = new Date(gig.event_date)
                        // Assume gig ends at midnight of the same day if no end time
                        eventDate.setHours(23, 59, 59, 999)
                    }

                    const item = {
                        id: g.id,
                        type_id: 'gig_application',
                        gig_id: g.gig_id,
                        raw_date: dateStr,
                        start_time: gig?.event_date,  // Add for consistency
                        name: gig?.name || 'Unknown Gig',
                        date: dateStr,
                        image: gig?.images?.[0] || 'https://picsum.photos/400/300',
                        status: g.status === 'pending' ? 'Applied' :
                            g.status === 'accepted' ? 'Accepted' :
                                g.status === 'rejected' ? 'Declined' : g.status,
                        type: 'Gig Application',
                        isCancelled: g.status === 'cancelled' || g.status === 'rejected',
                        action: g.status === 'accepted' ? 'View Details' : 'Details',
                        location: gig?.location,
                        reviewed_by_applicant: g.reviewed_by_applicant || false
                    }

                    if (g.status === 'pending') {
                        // @ts-ignore
                        categorized.Pending.push(item)
                    } else if (g.status === 'accepted') {
                        // Time-based categorization for accepted gigs
                        if (eventDate) {
                            const eventStart = new Date(gig.event_date)
                            eventStart.setHours(0, 0, 0, 0)  // Start of event day

                            if (now >= eventStart && now <= eventDate) {
                                // Gig is happening today
                                // @ts-ignore
                                categorized.Ongoing.push({ ...item, status: 'Happening Now' })
                            } else if (now > eventDate) {
                                // Gig has ended - show in Review if not yet reviewed
                                if (!g.reviewed_by_applicant) {
                                    // @ts-ignore
                                    categorized.Review.push({ ...item, status: 'Completed' })
                                }
                            } else {
                                // Gig is in the future
                                // @ts-ignore
                                categorized.Upcoming.push(item)
                            }
                        } else {
                            // No event date, put in Upcoming by default
                            // @ts-ignore
                            categorized.Upcoming.push(item)
                        }
                    } else if (g.status === 'rejected' || g.status === 'cancelled') {
                        // Declined applications - skip from main view
                    }
                })
            }

            // D. For Venue Owners: Fetch accepted applications for their gigs
            if (userRole === 'venue-owner') {
                // First get their gigs
                const { data: gigs } = await supabaseClient
                    .from('gigs')
                    .select('id, name, event_date, images, location')
                    .eq('organizer_id', userId)

                const gigIds = gigs?.map((g: any) => g.id) || []

                if (gigIds.length > 0) {
                    const { data: acceptedApps, error: appError } = await supabaseClient
                        .from('gig_applications')
                        .select(`
                            *,
                            applicant:applicant_id(full_name, avatar_url),
                            group:group_id(name, images)
                        `)
                        .in('gig_id', gigIds)
                        .in('gig_id', gigIds)
                        .in('status', ['accepted', 'pending'])
                        .order('created_at', { ascending: false })
                        .order('created_at', { ascending: false })

                    if (appError) {
                        console.log('Error fetching accepted applications:', appError)
                    }

                    // Process accepted applications
                    acceptedApps?.forEach((app: any) => {
                        const gig = gigs?.find((g: any) => g.id === app.gig_id)
                        const dateStr = gig?.event_date || 'TBA'
                        const performerName = app.group?.name || app.applicant?.full_name || 'Performer'

                        const item = {
                            id: app.id,
                            type_id: 'gig_application',
                            gig_id: app.gig_id,
                            user_id: app.applicant_id, // For profile link
                            raw_date: dateStr,
                            name: `${gig?.name || 'Gig'} - ${performerName}`,
                            date: dateStr,
                            image: app.group?.images?.[0] || app.applicant?.avatar_url || gig?.images?.[0] || 'https://picsum.photos/400/300',
                            status: app.status === 'pending' ? 'Action Required' : 'Confirmed',
                            type: 'Gig Application',
                            isCancelled: false,
                            action: app.status === 'pending' ? 'Confirm Now' : 'View Details',
                            location: gig?.location,
                            performer: performerName,
                            customer_name: performerName,
                            customer_avatar: app.group?.images?.[0] || app.applicant?.avatar_url
                        }

                        if (app.status === 'pending') {
                            // @ts-ignore
                            categorized.Pending.push(item)
                        } else {
                            // @ts-ignore
                            categorized.Upcoming.push(item)
                        }
                    })
                }
            }

            return new Response(JSON.stringify(categorized), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. CREATE BOOKING (Studio) - Supports multiple time slots
        if (action === 'create') {
            const { studio_id, user_id, date, start_time, end_time, time_slots, notes } = params

            // Support both old single-slot format and new multi-slot format
            let slots: Array<{ start: string, end: string }> = [];

            if (time_slots && Array.isArray(time_slots) && time_slots.length > 0) {
                // New multi-slot format
                slots = time_slots;
                console.log('📥 Creating multi-slot booking:', { studio_id, user_id, date, time_slots });
            } else if (start_time && end_time) {
                // Backwards compatibility: single slot format
                slots = [{ start: start_time, end: end_time }];
                console.log('📥 Creating single-slot booking:', { studio_id, user_id, date, start_time, end_time });
            } else {
                return new Response(JSON.stringify({
                    error: 'Invalid booking request. Provide either time_slots array or start_time/end_time.'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Validate slots are not empty
            if (slots.length === 0) {
                return new Response(JSON.stringify({
                    error: 'At least one time slot is required.'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Check if user already has a pending booking for this studio ON THIS DATE (prevent spam)
            const { data: existingPendingBooking, error: existingError } = await supabaseClient
                .from('studio_bookings')
                .select('id, status, booking_date')
                .eq('studio_id', studio_id)
                .eq('user_id', user_id)
                .eq('booking_date', date)
                .eq('status', 'pending')
                .maybeSingle()

            if (existingError) {
                console.error('Error checking existing bookings:', existingError)
            }

            if (existingPendingBooking) {
                return new Response(JSON.stringify({
                    error: 'You already have a pending booking for this studio on this date. Please wait for the studio owner to respond, or cancel your existing booking to create a new one.',
                    existing_booking_id: existingPendingBooking.id
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409, // Conflict
                })
            }

            // Convert slots to JSONB format for database function
            const slotsJsonb = JSON.stringify(slots);

            // Use multi-slot availability check
            console.log('🔍 Checking multi-slot availability...');
            const { data: isAvailable, error: availError } = await supabaseClient
                .rpc('are_slots_available', {
                    p_studio_id: studio_id,
                    p_booking_date: date,
                    p_time_slots: slots,
                    p_user_id: user_id
                })

            if (availError) {
                console.error('❌ Availability check error:', availError);
                // Fallback to single-slot check if new function doesn't exist
                if (availError.message?.includes('function') || availError.code === '42883') {
                    console.log('⚠️ Falling back to single-slot availability check...');
                    // Check each slot individually using old function
                    for (const slot of slots) {
                        const { data: slotAvailable, error: slotError } = await supabaseClient
                            .rpc('is_slot_available', {
                                p_studio_id: studio_id,
                                p_booking_date: date,
                                p_start_time: slot.start,
                                p_end_time: slot.end,
                                p_user_id: user_id
                            });

                        if (slotError) {
                            return new Response(JSON.stringify({
                                error: 'Availability check failed: ' + slotError.message,
                            }), {
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                                status: 400,
                            });
                        }

                        if (!slotAvailable) {
                            return new Response(JSON.stringify({
                                error: `Time slot ${slot.start} - ${slot.end} is not available.`
                            }), {
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                                status: 409,
                            });
                        }
                    }
                } else {
                    return new Response(JSON.stringify({
                        error: 'Availability check failed: ' + availError.message,
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 400,
                    });
                }
            } else if (!isAvailable) {
                return new Response(JSON.stringify({
                    error: 'One or more time slots are not available. They may be outside operating hours, overlap with another booking, or the studio may be closed on this date.'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409, // Conflict
                })
            }

            console.log('✅ All slots available');

            // First, verify studio has a valid hourly rate
            const { data: studioData, error: studioError } = await supabaseClient
                .from('studios')
                .select('id, name, hourly_rate')
                .eq('id', studio_id)
                .single();

            if (studioError || !studioData) {
                console.error('❌ Studio not found:', studioError);
                return new Response(JSON.stringify({
                    error: 'Studio not found.',
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                });
            }

            console.log('📊 Studio data:', studioData);

            if (!studioData.hourly_rate || studioData.hourly_rate <= 0) {
                console.error('❌ Studio has no valid hourly rate:', studioData.hourly_rate);
                return new Response(JSON.stringify({
                    error: 'This studio does not have a valid hourly rate configured. Please contact the studio owner.',
                    debug: { studio_id, hourly_rate: studioData.hourly_rate }
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Calculate pricing for all slots combined
            console.log('💰 Calculating multi-slot booking price...');
            let pricingData: any = null;

            const { data: pricing, error: pricingError } = await supabaseClient
                .rpc('calculate_multi_slot_price', {
                    p_studio_id: studio_id,
                    p_booking_date: date,
                    p_time_slots: slots
                })

            if (pricingError) {
                console.error('❌ Multi-slot pricing error:', pricingError);
                // Fallback to calculating each slot and summing
                if (pricingError.message?.includes('function') || pricingError.code === '42883') {
                    console.log('⚠️ Falling back to individual slot pricing...');
                    let totalHours = 0;
                    let totalPrice = 0;
                    let baseRate = 0;

                    for (const slot of slots) {
                        const { data: slotPricing } = await supabaseClient
                            .rpc('calculate_booking_price', {
                                p_studio_id: studio_id,
                                p_booking_date: date,
                                p_start_time: slot.start,
                                p_end_time: slot.end
                            });

                        if (slotPricing && slotPricing[0]) {
                            totalHours += slotPricing[0].hours || 0;
                            totalPrice += slotPricing[0].final_price || 0;
                            baseRate = slotPricing[0].base_rate || baseRate;
                        }
                    }

                    pricingData = {
                        base_rate: baseRate,
                        hours: totalHours,
                        subtotal: baseRate * totalHours,
                        modifiers: {},
                        final_price: totalPrice
                    };
                } else {
                    return new Response(JSON.stringify({
                        error: 'Pricing calculation failed: ' + pricingError.message,
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 400,
                    });
                }
            } else if (pricing && pricing.length > 0) {
                pricingData = pricing[0];
            }

            if (!pricingData) {
                console.error('❌ No pricing data returned, falling back to manual calculation');
                // Fallback: Calculate manually using studio's hourly rate
                let totalHours = 0;
                for (const slot of slots) {
                    const startParts = slot.start.split(':').map(Number);
                    const endParts = slot.end.split(':').map(Number);
                    const startMinutes = startParts[0] * 60 + startParts[1];
                    const endMinutes = endParts[0] * 60 + endParts[1];
                    totalHours += (endMinutes - startMinutes) / 60;
                }

                pricingData = {
                    base_rate: studioData.hourly_rate,
                    hours: totalHours,
                    total_hours: totalHours,
                    subtotal: studioData.hourly_rate * totalHours,
                    modifiers: {},
                    final_price: studioData.hourly_rate * totalHours
                };
                console.log('📊 Manual pricing fallback:', pricingData);
            }

            console.log('✅ Pricing calculated:', pricingData);

            // Get overall start and end times (for backwards compatibility)
            const allStartTimes = slots.map(s => s.start).sort();
            const allEndTimes = slots.map(s => s.end).sort();
            const overallStart = allStartTimes[0];
            const overallEnd = allEndTimes[allEndTimes.length - 1];

            // Validate pricing data before insert - use studio rate as fallback
            const finalBaseRate = pricingData.base_rate || studioData.hourly_rate;
            const finalHours = pricingData.total_hours || pricingData.hours;

            if (!finalBaseRate || finalBaseRate <= 0) {
                console.error('❌ Invalid base rate:', { pricingData, studioData });
                return new Response(JSON.stringify({
                    error: 'Unable to calculate booking price. Studio may not have a valid hourly rate configured.',
                    debug: { pricingData, studio_id, studio_hourly_rate: studioData.hourly_rate }
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            if (!finalHours || finalHours <= 0) {
                console.error('❌ Invalid hours calculated:', { pricingData, slots });
                return new Response(JSON.stringify({
                    error: 'Invalid booking duration. Please select valid time slots.',
                    debug: { pricingData, slots }
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            console.log('📤 Inserting multi-slot booking...', {
                studio_id, user_id, date, overallStart, overallEnd, slots,
                base_rate: finalBaseRate,
                hours: finalHours,
                subtotal: pricingData.subtotal || (finalBaseRate * finalHours),
                final_price: pricingData.final_price || (finalBaseRate * finalHours)
            });

            const { data, error } = await supabaseClient
                .from('studio_bookings')
                .insert({
                    studio_id,
                    user_id,
                    booking_date: date,
                    start_time: overallStart,  // Overall range for backwards compatibility
                    end_time: overallEnd,
                    time_slots: slots,  // Detailed slots
                    notes: notes || null,
                    status: 'pending',
                    // Store pricing details - use validated values
                    base_rate: finalBaseRate,
                    hours: finalHours,
                    subtotal: pricingData.subtotal || (finalBaseRate * finalHours),
                    modifiers_applied: pricingData.modifiers || {},
                    final_price: pricingData.final_price || (finalBaseRate * finalHours)
                })
                .select()
                .single()

            if (error) {
                console.error('❌ Insert error:', error);
                throw error;
            }

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 201,
            })
        }

        // 3. UPDATE STATUS (Cancel/Confirm)
        if (action === 'update_status') {
            const { booking_id, new_status, type_id, cancellation_reason } = params // type_id: 'studio_booking' or 'gig_application'

            console.log('📝 update_status called with:', { booking_id, new_status, type_id, cancellation_reason })

            let table = 'studio_bookings'
            if (type_id === 'gig_application') table = 'gig_applications'

            console.log('📝 Updating table:', table)

            const updateData: any = { status: new_status }

            // Add cancellation_reason if status is cancelled/rejected and reason is provided
            if ((new_status === 'cancelled' || new_status === 'rejected') && cancellation_reason) {
                updateData.cancellation_reason = cancellation_reason
            }

            console.log('📝 Update data:', updateData)

            const { data, error } = await supabaseClient
                .from(table)
                .update(updateData)
                .eq('id', booking_id)
                .select()

            console.log('📝 Update result:', { data, error })

            if (error) throw error

            // NOTIFICATION LOGIC
            if (['cancelled', 'rejected', 'confirmed', 'accepted'].includes(new_status)) {
                try {
                    // Determine who to notify
                    let targetUserId = null;
                    let notificationTitle = '';
                    let notificationMessage = '';
                    let notificationType = 'info';

                    if (table === 'studio_bookings') {
                        // For Studio Bookings
                        const { data: bookingInfo } = await supabaseClient
                            .from('studio_bookings')
                            .select('user_id, studio:studios(name)')
                            .eq('id', booking_id)
                            .single();

                        if (bookingInfo) {
                            if (new_status === 'cancelled' && cancellation_reason) {
                                targetUserId = bookingInfo.user_id;
                                notificationTitle = 'Booking Declined';
                                notificationMessage = `Your booking at ${bookingInfo.studio.name} has been declined/cancelled. Reason: ${cancellation_reason}`;
                                notificationType = 'error';
                            } else if (new_status === 'confirmed') {
                                targetUserId = bookingInfo.user_id;
                                notificationTitle = 'Booking Confirmed!';
                                notificationMessage = `Your booking at ${bookingInfo.studio.name} has been confirmed.`;
                                notificationType = 'success';
                            }
                        }
                    } else if (table === 'gig_applications') {
                        // For Gig Applications
                        const { data: gigInfo } = await supabaseClient
                            .from('gig_applications')
                            .select('applicant_id, gig:gigs(name)')
                            .eq('id', booking_id)
                            .single();

                        if (gigInfo) {
                            if (new_status === 'rejected') {
                                targetUserId = gigInfo.applicant_id;
                                notificationTitle = 'Application Declined';
                                notificationMessage = `Your application for ${gigInfo.gig.name} has been declined.`;
                                notificationType = 'error';
                            } else if (new_status === 'accepted') {
                                targetUserId = gigInfo.applicant_id;
                                notificationTitle = 'Application Accepted!';
                                notificationMessage = `Your application for ${gigInfo.gig.name} has been accepted!`;
                                notificationType = 'success';
                            }
                        }
                    }

                    if (targetUserId) {
                        await supabaseClient
                            .from('notifications')
                            .insert({
                                user_id: targetUserId,
                                type: notificationType,
                                title: notificationTitle,
                                message: notificationMessage,
                                read: false
                            });
                        console.log(`🔔 Notification sent to ${targetUserId}: ${notificationTitle}`);
                    }
                } catch (notifyError) {
                    console.error('Error sending notification:', notifyError);
                }
            }

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 4. CREATE REVIEW
        if (action === 'create_review') {
            const {
                userId,
                rating,
                content,
                studioId,
                gigId,
                targetUserId,  // For reviewing a user (musician or owner)
                bookingId,
                bookingType,   // 'studio_booking' or 'gig_application'
                reviewerRole   // 'customer' or 'owner' / 'applicant' or 'organizer'
            } = params

            // Check for duplicate review
            let existingReview = null
            if (studioId) {
                const { data } = await supabaseClient
                    .from('reviews')
                    .select('id')
                    .eq('author_id', userId)
                    .eq('studio_id', studioId)
                    .maybeSingle()
                existingReview = data
            } else if (gigId) {
                const { data } = await supabaseClient
                    .from('reviews')
                    .select('id')
                    .eq('author_id', userId)
                    .eq('gig_id', gigId)
                    .maybeSingle()
                existingReview = data
            } else if (targetUserId) {
                const { data } = await supabaseClient
                    .from('reviews')
                    .select('id')
                    .eq('author_id', userId)
                    .eq('user_id', targetUserId)
                    .maybeSingle()
                existingReview = data
            }

            if (existingReview) {
                return new Response(JSON.stringify({
                    error: 'You have already submitted a review for this entity.'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409,
                })
            }

            // Insert the review
            const reviewData: any = {
                author_id: userId,
                rating,
                content: content || null,
            }

            if (studioId) reviewData.studio_id = studioId
            if (gigId) reviewData.gig_id = gigId
            if (targetUserId) reviewData.user_id = targetUserId
            if (bookingId && bookingType === 'studio_booking') reviewData.studio_booking_id = bookingId
            if (bookingId && bookingType === 'gig_application') reviewData.gig_application_id = bookingId

            const { data: review, error: reviewError } = await supabaseClient
                .from('reviews')
                .insert(reviewData)
                .select()
                .single()

            if (reviewError) throw reviewError

            // Update booking reviewed status
            if (bookingId && bookingType === 'studio_booking') {
                const updateField = reviewerRole === 'customer' ? 'reviewed_by_customer' : 'reviewed_by_owner'
                await supabaseClient
                    .from('studio_bookings')
                    .update({ [updateField]: true })
                    .eq('id', bookingId)

                // Check if BOTH have reviewed -> mark as completed
                const { data: booking } = await supabaseClient
                    .from('studio_bookings')
                    .select('reviewed_by_customer, reviewed_by_owner')
                    .eq('id', bookingId)
                    .single()

                if (booking?.reviewed_by_customer && booking?.reviewed_by_owner) {
                    await supabaseClient
                        .from('studio_bookings')
                        .update({ status: 'completed' })
                        .eq('id', bookingId)
                }
            } else if (bookingId && bookingType === 'gig_application') {
                const updateField = reviewerRole === 'applicant' ? 'reviewed_by_applicant' : 'reviewed_by_organizer'
                await supabaseClient
                    .from('gig_applications')
                    .update({ [updateField]: true })
                    .eq('id', bookingId)
            }

            return new Response(JSON.stringify(review), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 201,
            })
        }

        // 5. UPLOAD PROOF
        if (action === 'upload_proof') {
            const { bookingId, proofUrl } = params

            const { data, error } = await supabaseClient
                .from('studio_bookings')
                .update({ proof_url: proofUrl })
                .eq('id', bookingId)
                .select()
                .single()

            if (error) throw error

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 6. CHECK REVIEW STATUS (to know if user already reviewed)
        if (action === 'check_review_status') {
            const { bookingId, bookingType } = params

            if (bookingType === 'studio_booking') {
                const { data, error } = await supabaseClient
                    .from('studio_bookings')
                    .select('reviewed_by_customer, reviewed_by_owner, status')
                    .eq('id', bookingId)
                    .single()

                if (error) throw error
                return new Response(JSON.stringify(data), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            } else {
                const { data, error } = await supabaseClient
                    .from('gig_applications')
                    .select('reviewed_by_applicant, reviewed_by_organizer, status')
                    .eq('id', bookingId)
                    .single()

                if (error) throw error
                return new Response(JSON.stringify(data), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            }
        }

        throw new Error('Invalid action')

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
