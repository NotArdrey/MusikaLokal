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
                        .from('studio_bookings_with_cost')
                        .select('*')
                        .in('studio_id', studioIds)
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
                            user_id: b.user_id,  // The musician who booked
                            raw_date: b.booking_date,
                            start_time: b.start_time,
                            end_time: b.end_time,
                            name: `${b.studio_name} - ${b.user_full_name || b.user_email || 'Guest'}`,
                            date: `${b.booking_date} • ${b.start_time} - ${b.end_time}`,
                            image: b.studio_images?.[0] || 'https://picsum.photos/400/300',
                            status: b.status === 'pending' ? 'Awaiting Your Approval' :
                                b.status === 'confirmed' ? 'Confirmed' :
                                    b.status === 'cancelled' ? 'Declined' : b.status,
                            type: 'Studio Booking',
                            isCancelled: b.status === 'cancelled',
                            action: b.status === 'pending' ? 'Confirm Now' : 'Details',
                            duration_hours: b.duration_hours,
                            total_cost: b.total_cost,
                            studio_name: b.studio_name,
                            notes: b.notes,
                            customer_name: b.user_full_name || b.user_email || 'Guest',
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
                            g.status === 'accepted' || g.status === 'approved' ? 'Accepted' :
                                g.status === 'rejected' ? 'Declined' : g.status,
                        type: 'Gig Application',
                        isCancelled: g.status === 'cancelled' || g.status === 'rejected',
                        action: g.status === 'accepted' || g.status === 'approved' ? 'View Details' : 'Details',
                        location: gig?.location,
                        reviewed_by_applicant: g.reviewed_by_applicant || false
                    }

                    if (g.status === 'pending') {
                        // @ts-ignore
                        categorized.Pending.push(item)
                    } else if (g.status === 'accepted' || g.status === 'approved') {
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
                        .in('status', ['accepted', 'approved'])
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
                            type_id: 'gig_booking',
                            gig_id: app.gig_id,
                            raw_date: dateStr,
                            name: `${gig?.name || 'Gig'} - ${performerName}`,
                            date: dateStr,
                            image: app.group?.images?.[0] || app.applicant?.avatar_url || gig?.images?.[0] || 'https://picsum.photos/400/300',
                            status: 'Confirmed',
                            type: 'Gig Booking',
                            isCancelled: false,
                            action: 'View Details',
                            location: gig?.location,
                            performer: performerName
                        }

                        // @ts-ignore
                        categorized.Upcoming.push(item)
                    })
                }
            }

            return new Response(JSON.stringify(categorized), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. CREATE BOOKING (Studio)
        if (action === 'create') {
            const { studio_id, user_id, date, start_time, end_time, notes } = params

            console.log('📥 Creating booking:', { studio_id, user_id, date, start_time, end_time });

            // Check if user already has a pending booking for this studio (prevent spam)
            const { data: existingPendingBooking, error: existingError } = await supabaseClient
                .from('studio_bookings')
                .select('id, status')
                .eq('studio_id', studio_id)
                .eq('user_id', user_id)
                .eq('status', 'pending')
                .maybeSingle()

            if (existingError) {
                console.error('Error checking existing bookings:', existingError)
            }

            if (existingPendingBooking) {
                return new Response(JSON.stringify({
                    error: 'You already have a pending booking for this studio. Please wait for the studio owner to respond before creating another booking.',
                    existing_booking_id: existingPendingBooking.id
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409, // Conflict
                })
            }

            // Use the comprehensive is_slot_available function
            console.log('🔍 Checking slot availability...');
            const { data: isAvailable, error: availError } = await supabaseClient
                .rpc('is_slot_available', {
                    p_studio_id: studio_id,
                    p_booking_date: date,
                    p_start_time: start_time,
                    p_end_time: end_time,
                    p_user_id: user_id
                })

            if (availError) {
                console.error('❌ Availability check error:', availError);
                return new Response(JSON.stringify({
                    error: 'Availability check failed: ' + availError.message,
                    details: availError.toString(),
                    hint: 'The is_slot_available function may not exist or has an error',
                    code: availError.code
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            console.log('✅ Slot availability:', isAvailable);

            if (!isAvailable) {
                return new Response(JSON.stringify({
                    error: 'This time slot is not available. It may be outside operating hours, overlap with another booking, or the studio may be closed on this date.'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409, // Conflict
                })
            }

            // Calculate proper pricing with modifiers (REQUIRED)
            console.log('💰 Calculating booking price...');
            const { data: pricing, error: pricingError } = await supabaseClient
                .rpc('calculate_booking_price', {
                    p_studio_id: studio_id,
                    p_booking_date: date,
                    p_start_time: start_time,
                    p_end_time: end_time
                })

            if (pricingError) {
                console.error('❌ Pricing calculation error:', pricingError);
                return new Response(JSON.stringify({
                    error: 'Pricing calculation failed: ' + pricingError.message,
                    details: pricingError.toString(),
                    hint: 'The calculate_booking_price function may not exist or has an error',
                    code: pricingError.code
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            if (!pricing || pricing.length === 0) {
                console.error('❌ No pricing data returned');
                return new Response(JSON.stringify({
                    error: 'Unable to calculate booking price. Please try again or contact support.'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 500,
                })
            }

            console.log('✅ Pricing calculated:', pricing);

            const pricingData = pricing[0]

            console.log('📤 Inserting booking...');
            const { data, error } = await supabaseClient
                .from('studio_bookings')
                .insert({
                    studio_id,
                    user_id,
                    booking_date: date,
                    start_time,
                    end_time,
                    notes: notes || null,
                    status: 'pending',
                    // Store pricing details (REQUIRED fields)
                    base_rate: pricingData.base_rate,
                    hours: pricingData.hours,
                    subtotal: pricingData.subtotal,
                    modifiers_applied: pricingData.modifiers || {},
                    final_price: pricingData.final_price
                })
                .select()
                .single()

            if (error) throw error

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 201,
            })
        }

        // 3. UPDATE STATUS (Cancel/Confirm)
        if (action === 'update_status') {
            const { booking_id, new_status, type_id, cancellation_reason } = params // type_id: 'studio_booking' or 'gig_application'

            let table = 'studio_bookings'
            if (type_id === 'gig_application') table = 'gig_applications'

            const updateData: any = { status: new_status }

            // Only add cancellation_reason if status is cancelled and reason is provided
            if (new_status === 'cancelled' && cancellation_reason) {
                updateData.cancellation_reason = cancellation_reason
            }

            const { data, error } = await supabaseClient
                .from(table)
                .update(updateData)
                .eq('id', booking_id)
                .select()

            if (error) throw error

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
