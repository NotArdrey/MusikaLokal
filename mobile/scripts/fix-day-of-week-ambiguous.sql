-- Fix for "column reference day_of_week is ambiguous" error
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION are_slots_available(
    p_studio_id UUID,
    p_booking_date DATE,
    p_time_slots JSONB,
    p_user_id UUID DEFAULT NULL,
    p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    slot JSONB;
    slot_start TIME;
    slot_end TIME;
    v_day_of_week INTEGER;
    is_available BOOLEAN;
BEGIN
    -- Get day of week (0=Sunday, 6=Saturday)
    v_day_of_week := EXTRACT(DOW FROM p_booking_date)::INTEGER;
    
    -- Check each slot
    FOR slot IN SELECT * FROM jsonb_array_elements(p_time_slots)
    LOOP
        slot_start := (slot->>'start')::TIME;
        slot_end := (slot->>'end')::TIME;
        
        -- 1. Check if studio is open on this day and time
        IF NOT EXISTS (
            SELECT 1 FROM studio_operating_hours soh
            WHERE soh.studio_id = p_studio_id
              AND soh.day_of_week = v_day_of_week
              AND soh.is_open = true
              AND soh.open_time <= slot_start
              AND soh.close_time >= slot_end
        ) THEN
            -- Not within any operating hours slot
            RETURN FALSE;
        END IF;
        
        -- 2. Check for date override (studio closed on specific date)
        IF EXISTS (
            SELECT 1 FROM studio_date_overrides
            WHERE studio_id = p_studio_id
              AND override_date = p_booking_date
              AND is_open = false
        ) THEN
            RETURN FALSE;
        END IF;
        
        -- 3. Check for conflicts with existing confirmed/pending bookings
        IF EXISTS (
            SELECT 1 FROM studio_bookings sb
            CROSS JOIN LATERAL jsonb_array_elements(sb.time_slots) AS existing_slot
            WHERE sb.studio_id = p_studio_id
              AND sb.booking_date = p_booking_date
              AND sb.status IN ('pending', 'confirmed')
              AND (p_exclude_booking_id IS NULL OR sb.id != p_exclude_booking_id)
              AND (
                  -- Check for time overlap
                  ((existing_slot->>'start')::TIME < slot_end AND (existing_slot->>'end')::TIME > slot_start)
              )
        ) THEN
            RETURN FALSE;
        END IF;
        
        -- 4. Check for conflicts with booking holds (cart system)
        IF EXISTS (
            SELECT 1 FROM booking_holds
            WHERE studio_id = p_studio_id
              AND booking_date = p_booking_date
              AND expires_at > NOW()
              AND (p_user_id IS NULL OR user_id != p_user_id)
              AND (start_time < slot_end AND end_time > slot_start)
        ) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
