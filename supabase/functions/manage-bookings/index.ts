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
                        raw_date: b.booking_date,
                        start_time: b.start_time,
                        end_time: b.end_time,
                        name: b.studio_name || 'Unknown Studio',
                        date: `${b.booking_date} • ${b.start_time} - ${b.end_time}`,
                        image: b.studio_images?.[0] || 'https://picsum.photos/400/300',
                        status: b.status === 'pending' ? 'Waiting for Approval' :
                            b.status === 'confirmed' ? 'Confirmed' :
                                b.status === 'cancelled' ? 'Cancelled' : b.status,
                        type: 'Studio Booking',
                        isCancelled: b.status === 'cancelled',
                        action: b.status === 'pending' ? 'View Details' : 'Details',
                        duration_hours: b.duration_hours,
                        total_cost: b.total_cost,
                        notes: b.notes
                    }

                    if (b.status === 'pending') {
                        // @ts-ignore
                        categorized.Pending.push(item)
                    } else if (b.status === 'confirmed') {
                        if (now >= bookingDate && now <= endDate) {
                            // @ts-ignore
                            categorized.Ongoing.push({ ...item, status: 'In Progress' })
                        } else if (now > endDate) {
                            // @ts-ignore
                            categorized.Review.push({ ...item, status: 'Completed' })
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
                            raw_date: b.booking_date,
                            start_time: b.start_time,
                            end_time: b.end_time,
                            name: `Booking by ${b.user_email || 'Guest'}`,
                            date: `${b.booking_date} • ${b.start_time} - ${b.end_time}`,
                            image: b.studio_images?.[0] || 'https://picsum.photos/400/300',
                            status: b.status === 'pending' ? 'Awaiting Your Approval' :
                                b.status === 'confirmed' ? 'Confirmed' :
                                    b.status === 'cancelled' ? 'Cancelled' : b.status,
                            type: 'Studio Booking',
                            isCancelled: b.status === 'cancelled',
                            action: b.status === 'pending' ? 'Confirm Now' : 'Details',
                            duration_hours: b.duration_hours,
                            total_cost: b.total_cost,
                            studio_name: b.studio_name,
                            notes: b.notes
                        }

                        if (b.status === 'pending') {
                            // @ts-ignore
                            categorized.Pending.push(item)
                        } else if (b.status === 'confirmed') {
                            if (now >= bookingDate && now <= endDate) {
                                // @ts-ignore
                                categorized.Ongoing.push({ ...item, status: 'In Progress' })
                            } else if (now > endDate) {
                                // @ts-ignore
                                categorized.Review.push({ ...item, status: 'Completed' })
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

            // C. For ALL roles: Fetch Gig Applications if they're a musician
            if (userRole === 'musician') {
                const { data: gigApps, error: gigError } = await supabaseClient
                    .from('gig_applications')
                    .select('*, gig:gig_id(name, event_date, image_url)')
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

                    const item = {
                        id: g.id,
                        type_id: 'gig_application',
                        gig_id: g.gig_id,
                        raw_date: dateStr,
                        name: gig?.name || 'Unknown Gig',
                        date: dateStr,
                        image: gig?.image_url || 'https://picsum.photos/400/300',
                        status: g.status === 'pending' ? 'Applied' :
                            g.status === 'accepted' ? 'Accepted' :
                                g.status === 'rejected' ? 'Rejected' : g.status,
                        type: 'Gig Application',
                        isCancelled: g.status === 'cancelled' || g.status === 'rejected',
                        action: g.status === 'accepted' ? 'View Details' : 'Details',
                    }

                    if (g.status === 'pending') {
                        // @ts-ignore
                        categorized.Pending.push(item)
                    } else if (g.status === 'accepted') {
                        // @ts-ignore
                        categorized.Upcoming.push(item)
                    } else {
                        if (g.status === 'rejected' || g.status === 'cancelled') {
                            // @ts-ignore
                            categorized.Upcoming.push({ ...item, isCancelled: true })
                        }
                    }
                })
            }

            return new Response(JSON.stringify(categorized), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. CREATE BOOKING (Studio)
        if (action === 'create') {
            const { studio_id, user_id, date, start_time, end_time, notes } = params

            // Use the comprehensive is_slot_available function
            const { data: isAvailable, error: availError } = await supabaseClient
                .rpc('is_slot_available', {
                    p_studio_id: studio_id,
                    p_booking_date: date,
                    p_start_time: start_time,
                    p_end_time: end_time,
                    p_user_id: user_id
                })

            if (availError) {
                console.error('Availability check error:', availError)
                throw availError
            }

            if (!isAvailable) {
                return new Response(JSON.stringify({ 
                    error: 'This time slot is not available. It may be outside operating hours, overlap with another booking, or the studio may be closed on this date.' 
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409, // Conflict
                })
            }

            // Calculate proper pricing with modifiers (REQUIRED)
            const { data: pricing, error: pricingError } = await supabaseClient
                .rpc('calculate_booking_price', {
                    p_studio_id: studio_id,
                    p_booking_date: date,
                    p_start_time: start_time,
                    p_end_time: end_time
                })

            if (pricingError || !pricing || pricing.length === 0) {
                console.error('Pricing calculation error:', pricingError)
                return new Response(JSON.stringify({ 
                    error: 'Unable to calculate booking price. Please try again or contact support.' 
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 500,
                })
            }

            const pricingData = pricing[0]

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
            const { booking_id, new_status, type_id } = params // type_id: 'studio_booking' or 'gig_application'

            let table = 'studio_bookings'
            if (type_id === 'gig_application') table = 'gig_applications'

            const { data, error } = await supabaseClient
                .from(table)
                .update({ status: new_status })
                .eq('id', booking_id)
                .select()

            if (error) throw error

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        throw new Error('Invalid action')

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
