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

        // 1. FETCH BOOKINGS (using view with computed cost)
        if (action === 'fetch') {
            const { userId } = params

            // Fetch Studio Bookings using the view that computes duration and cost
            const { data: bookings, error } = await supabaseClient
                .from('studio_bookings_with_cost')
                .select('*')
                .eq('user_id', userId)
                .order('booking_date', { ascending: false })

            if (error) throw error

            const categorized = {
                Pending: [],
                Upcoming: [],
                Ongoing: [],
                Review: []
            }

            const now = new Date()

            // @ts-ignore
            bookings?.forEach((b: any) => {
                const bookingDate = new Date(`${b.booking_date}T${b.start_time}`)
                const endDate = new Date(`${b.booking_date}T${b.end_time}`)

                const item = {
                    id: b.id,
                    name: b.studio_name || 'Unknown Studio',
                    date: `${b.booking_date} • ${b.start_time} - ${b.end_time}`,
                    image: b.studio_images?.[0] || 'https://picsum.photos/400/300',
                    status: b.status === 'pending' ? 'Waiting for Approval' :
                        b.status === 'confirmed' ? 'Confirmed' :
                            b.status === 'cancelled' ? 'Cancelled' : b.status,
                    type: 'Studio Booking',
                    isCancelled: b.status === 'cancelled',
                    action: b.status === 'pending' ? 'View Details' : 'Details',
                    // Computed values from view
                    duration_hours: b.computed_duration_hours,
                    total_cost: b.computed_total_cost
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
                    // Include cancelled in Upcoming for visibility? Or separate? 
                    // Mock data put cancelled in Upcoming.
                    // @ts-ignore
                    categorized.Upcoming.push(item)
                }
            })

            return new Response(JSON.stringify(categorized), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. CREATE BOOKING (no longer stores duration_hours or total_cost)
        if (action === 'create') {
            const { studio_id, user_id, date, start_time, end_time } = params

            // Overlap Check
            // Overlap if: (RequestStart < ExistingEnd) AND (RequestEnd > ExistingStart)
            const { data: overlaps, error: overlapError } = await supabaseClient
                .from('studio_bookings')
                .select('id')
                .eq('studio_id', studio_id)
                .eq('booking_date', date)
                .eq('status', 'confirmed') // Only check confirmed bookings? Or pending too? Safer to check pending too if we want to avoid double booking
                .or(`and(start_time.lt.${end_time},end_time.gt.${start_time})`)

            if (overlapError) throw overlapError

            // @ts-ignore
            if (overlaps && overlaps.length > 0) {
                return new Response(JSON.stringify({ error: 'Time slot overlaps with an existing booking.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409, // Conflict
                })
            }

            // Insert booking without derived columns (they are computed via view)
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

            // Fetch the created booking with computed values from view
            const { data: bookingWithCost, error: fetchError } = await supabaseClient
                .from('studio_bookings_with_cost')
                .select('*')
                .eq('id', data.id)
                .single()

            if (fetchError) {
                // Return basic data if view fetch fails
                return new Response(JSON.stringify(data), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 201,
                })
            }

            return new Response(JSON.stringify({
                ...bookingWithCost,
                duration_hours: bookingWithCost.computed_duration_hours,
                total_cost: bookingWithCost.computed_total_cost
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 201,
            })
        }

        // 3. UPDATE STATUS (Cancel/Confirm)
        if (action === 'update_status') {
            const { booking_id, new_status } = params

            const { data, error } = await supabaseClient
                .from('studio_bookings')
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
