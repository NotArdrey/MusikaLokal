// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

            // A. Fetch Studio Bookings
            const { data: bookings, error: bookingError } = await supabaseClient
                .from('studio_bookings_with_cost')
                .select('*')
                .eq('user_id', userId)
                .order('booking_date', { ascending: false })

            if (bookingError) throw bookingError

            // B. Fetch Gig Applications (Personal)
            // Assuming 'gig_applications' has 'musician_id' and joins to 'gigs'
            const { data: gigApps, error: gigError } = await supabaseClient
                .from('gig_applications')
                .select('*, gigs(name, event_date, image_url)') // Adjusted fields based on assumption
                .eq('musician_id', userId)
                .order('created_at', { ascending: false })

            if (gigError) {
                console.log('Error fetching gig apps:', gigError)
                // Don't fail entire request if just gig apps fail? Or throw?
                // throw gigError
            }

            const categorized = {
                Pending: [],
                Upcoming: [],
                Ongoing: [],
                Review: []
            }

            const now = new Date()

            // Process Studio Bookings
            // @ts-ignore
            bookings?.forEach((b: any) => {
                const bookingDate = new Date(`${b.booking_date}T${b.start_time}`)
                const endDate = new Date(`${b.booking_date}T${b.end_time}`)

                const item = {
                    id: b.id,
                    type_id: 'studio_booking', // internal type identifier
                    raw_date: b.booking_date,
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
                    total_cost: b.total_cost
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

            // Process Gig Applications
            // @ts-ignore
            gigApps?.forEach((g: any) => {
                const gig = g.gigs;
                const dateStr = gig?.event_date || g.created_at?.split('T')[0] || 'TBA'; // Fallback
                // For gig apps, 'pending' is awaiting organizer decision
                // 'accepted' -> Upcoming?

                const item = {
                    id: g.id,
                    type_id: 'gig_application',
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
                    categorized.Upcoming.push(item) // Treat accepted gig as upcoming?
                } else {
                    // @ts-ignore
                    categorized.Review.push(item) // Rejected or other? Or put in Upcoming as cancelled?
                    // Let's put rejected in Upcoming/History but marked cancelled
                    if (g.status === 'rejected' || g.status === 'cancelled') {
                        // @ts-ignore
                        categorized.Upcoming.push({ ...item, isCancelled: true })
                    }
                }
            })

            return new Response(JSON.stringify(categorized), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. CREATE BOOKING (Studio)
        if (action === 'create') {
            const { studio_id, user_id, date, start_time, end_time } = params

            // Overlap Check
            const { data: overlaps, error: overlapError } = await supabaseClient
                .from('studio_bookings')
                .select('id')
                .eq('studio_id', studio_id)
                .eq('booking_date', date)
                .eq('status', 'confirmed')
                .or(`and(start_time.lt.${end_time},end_time.gt.${start_time})`)

            if (overlapError) throw overlapError

            // @ts-ignore
            if (overlaps && overlaps.length > 0) {
                return new Response(JSON.stringify({ error: 'Time slot overlaps with an existing booking.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409, // Conflict
                })
            }

            const { data, error } = await supabaseClient
                .from('studio_bookings')
                .insert({
                    studio_id,
                    user_id,
                    booking_date: date,
                    start_time,
                    end_time,
                    status: 'pending'
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
