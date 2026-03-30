-- Migration: Gig Application Improvements
-- Features:
-- 1. Configurable reapplication cooldown for venue owners
-- 2. Slot fulfillment tracking to prevent overbooking
-- 3. Auto-close gig when all slots are filled

-- ============================================================
-- 1. ADD REAPPLICATION COOLDOWN TO GIGS TABLE
-- ============================================================
-- Allows venue owners to configure how long a musician must wait 
-- before reapplying after rejection (in days). NULL = use system default (30 days)
ALTER TABLE public.gigs 
ADD COLUMN IF NOT EXISTS reapplication_cooldown_days INTEGER DEFAULT 30 
CHECK (reapplication_cooldown_days >= 0 AND reapplication_cooldown_days <= 365);

COMMENT ON COLUMN gigs.reapplication_cooldown_days IS 
'Number of days a rejected musician must wait before reapplying. 0 = can reapply immediately, NULL = system default (30 days)';

-- ============================================================
-- 2. ADD SLOT TRACKING FIELDS TO GIGS TABLE
-- ============================================================
-- Track how many slots have been filled per category
ALTER TABLE public.gigs 
ADD COLUMN IF NOT EXISTS slots_filled JSONB DEFAULT '{
  "solo": { "accepted": 0, "applicant_ids": [] },
  "duo": { "accepted": 0, "applicant_ids": [] },
  "band": { "accepted": 0, "applicant_ids": [] }
}'::jsonb;

ALTER TABLE public.gigs 
ADD COLUMN IF NOT EXISTS total_slots_filled INTEGER DEFAULT 0;

COMMENT ON COLUMN gigs.slots_filled IS 
'Tracks accepted applications per slot type: solo, duo, band. Includes count and list of applicant IDs';

COMMENT ON COLUMN gigs.total_slots_filled IS 
'Quick count of total accepted applications across all slot types';

-- ============================================================
-- 3. ADD REJECTED_AT TIMESTAMP TO GIG_APPLICATIONS
-- ============================================================
-- Track when an application was rejected for cooldown calculation
ALTER TABLE public.gig_applications 
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.gig_applications 
ADD COLUMN IF NOT EXISTS slot_type TEXT CHECK (slot_type IN ('solo', 'duo', 'band'));

COMMENT ON COLUMN gig_applications.rejected_at IS 
'Timestamp when the application was rejected, used for cooldown calculation';

COMMENT ON COLUMN gig_applications.slot_type IS 
'The slot type this application is for: solo, duo, or band';

-- ============================================================
-- 4. CREATE TRIGGER TO UPDATE REJECTED_AT ON STATUS CHANGE
-- ============================================================
CREATE OR REPLACE FUNCTION update_application_rejected_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
        NEW.rejected_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_rejected_at ON gig_applications;
CREATE TRIGGER trigger_update_rejected_at
    BEFORE UPDATE ON gig_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_application_rejected_at();

-- ============================================================
-- 5. CREATE FUNCTION TO UPDATE SLOT COUNTS ON ACCEPTANCE
-- ============================================================
CREATE OR REPLACE FUNCTION update_gig_slot_counts()
RETURNS TRIGGER AS $$
DECLARE
    v_slot_type TEXT;
    v_slots_needed INTEGER;
    v_current_filled INTEGER;
    v_requirements JSONB;
    v_slots_filled JSONB;
    v_applicant_id UUID;
BEGIN
    -- Only process when status changes to 'accepted'
    IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
        v_slot_type := COALESCE(NEW.slot_type, 'solo');
        v_applicant_id := NEW.applicant_id;
        
        -- Get current gig data
        SELECT requirements, COALESCE(slots_filled, '{
            "solo": { "accepted": 0, "applicant_ids": [] },
            "duo": { "accepted": 0, "applicant_ids": [] },
            "band": { "accepted": 0, "applicant_ids": [] }
        }'::jsonb)
        INTO v_requirements, v_slots_filled
        FROM gigs WHERE id = NEW.gig_id;
        
        -- Update the slots_filled count for this slot type
        v_slots_filled := jsonb_set(
            v_slots_filled,
            ARRAY[v_slot_type, 'accepted'],
            to_jsonb(COALESCE((v_slots_filled->v_slot_type->>'accepted')::int, 0) + 1)
        );
        
        -- Add applicant ID to the list
        v_slots_filled := jsonb_set(
            v_slots_filled,
            ARRAY[v_slot_type, 'applicant_ids'],
            COALESCE(v_slots_filled->v_slot_type->'applicant_ids', '[]'::jsonb) || to_jsonb(v_applicant_id::text)
        );
        
        -- Update the gig with new slot counts
        UPDATE gigs 
        SET 
            slots_filled = v_slots_filled,
            total_slots_filled = COALESCE(total_slots_filled, 0) + 1,
            -- Auto-close if all slots are filled
            status = CASE 
                WHEN COALESCE(total_slots_filled, 0) + 1 >= COALESCE((v_requirements->'total_slots_needed')::int, 999)
                THEN 'closed'
                ELSE status
            END
        WHERE id = NEW.gig_id;
        
    -- Handle when status changes FROM 'accepted' (rejection/cancellation of accepted app)
    ELSIF OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
        v_slot_type := COALESCE(OLD.slot_type, 'solo');
        v_applicant_id := OLD.applicant_id;
        
        -- Get current gig data
        SELECT COALESCE(slots_filled, '{
            "solo": { "accepted": 0, "applicant_ids": [] },
            "duo": { "accepted": 0, "applicant_ids": [] },
            "band": { "accepted": 0, "applicant_ids": [] }
        }'::jsonb)
        INTO v_slots_filled
        FROM gigs WHERE id = NEW.gig_id;
        
        -- Decrease the slots_filled count
        v_slots_filled := jsonb_set(
            v_slots_filled,
            ARRAY[v_slot_type, 'accepted'],
            to_jsonb(GREATEST(COALESCE((v_slots_filled->v_slot_type->>'accepted')::int, 0) - 1, 0))
        );
        
        -- Remove applicant ID from the list
        v_slots_filled := jsonb_set(
            v_slots_filled,
            ARRAY[v_slot_type, 'applicant_ids'],
            (SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) 
             FROM jsonb_array_elements(COALESCE(v_slots_filled->v_slot_type->'applicant_ids', '[]'::jsonb)) elem 
             WHERE elem::text != ('"' || v_applicant_id::text || '"'))
        );
        
        -- Update the gig with new slot counts and reopen if needed
        UPDATE gigs 
        SET 
            slots_filled = v_slots_filled,
            total_slots_filled = GREATEST(COALESCE(total_slots_filled, 0) - 1, 0),
            -- Re-open if was auto-closed
            status = CASE 
                WHEN status = 'closed' THEN 'open'
                ELSE status
            END
        WHERE id = NEW.gig_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_slot_counts ON gig_applications;
CREATE TRIGGER trigger_update_slot_counts
    AFTER UPDATE ON gig_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_gig_slot_counts();

-- Also trigger on INSERT with accepted status (edge case)
DROP TRIGGER IF EXISTS trigger_insert_slot_counts ON gig_applications;
CREATE TRIGGER trigger_insert_slot_counts
    AFTER INSERT ON gig_applications
    FOR EACH ROW
    WHEN (NEW.status = 'accepted')
    EXECUTE FUNCTION update_gig_slot_counts();

-- ============================================================
-- 6. CREATE FUNCTION TO CHECK IF MUSICIAN CAN REAPPLY
-- ============================================================
CREATE OR REPLACE FUNCTION can_musician_reapply(
    p_gig_id UUID,
    p_applicant_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_cooldown_days INTEGER;
    v_last_rejection TIMESTAMP WITH TIME ZONE;
    v_rejection_count INTEGER;
BEGIN
    -- Get gig's cooldown setting
    SELECT COALESCE(reapplication_cooldown_days, 30)
    INTO v_cooldown_days
    FROM gigs WHERE id = p_gig_id;
    
    -- Check for recent rejections within cooldown period
    SELECT rejected_at, COUNT(*)
    INTO v_last_rejection, v_rejection_count
    FROM gig_applications
    WHERE gig_id = p_gig_id 
        AND applicant_id = p_applicant_id 
        AND status = 'rejected'
        AND rejected_at IS NOT NULL
    GROUP BY rejected_at
    ORDER BY rejected_at DESC
    LIMIT 1;
    
    -- If no rejections found, can apply
    IF v_last_rejection IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- If cooldown is 0, can always reapply immediately
    IF v_cooldown_days = 0 THEN
        RETURN TRUE;
    END IF;
    
    -- Check if cooldown period has passed
    IF NOW() >= v_last_rejection + (v_cooldown_days || ' days')::INTERVAL THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. CREATE FUNCTION TO CHECK IF GIG HAS AVAILABLE SLOTS
-- ============================================================
CREATE OR REPLACE FUNCTION gig_has_available_slots(
    p_gig_id UUID,
    p_slot_type TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_requirements JSONB;
    v_slots_filled JSONB;
    v_total_needed INTEGER;
    v_total_filled INTEGER;
    v_type_needed INTEGER;
    v_type_filled INTEGER;
BEGIN
    SELECT requirements, COALESCE(slots_filled, '{}'::jsonb), COALESCE(total_slots_filled, 0)
    INTO v_requirements, v_slots_filled, v_total_filled
    FROM gigs WHERE id = p_gig_id;
    
    -- Check total slots
    v_total_needed := COALESCE((v_requirements->'total_slots_needed')::int, 999);
    
    IF v_total_filled >= v_total_needed THEN
        RETURN FALSE;
    END IF;
    
    -- If slot type specified, check that specific type
    IF p_slot_type IS NOT NULL THEN
        v_type_needed := COALESCE((v_requirements->'slots'->p_slot_type->>'needed')::int, 0);
        v_type_filled := COALESCE((v_slots_filled->p_slot_type->>'accepted')::int, 0);
        
        -- If this slot type is needed and filled, return false
        IF v_type_needed > 0 AND v_type_filled >= v_type_needed THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. CREATE INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_gig_applications_rejected_at 
    ON gig_applications(gig_id, applicant_id, rejected_at) 
    WHERE status = 'rejected';

CREATE INDEX IF NOT EXISTS idx_gigs_slots_status 
    ON gigs(status) 
    WHERE status = 'open';

-- ============================================================
-- 9. UPDATE EXISTING GIGS WITH DEFAULT VALUES
-- ============================================================
UPDATE gigs 
SET 
    reapplication_cooldown_days = COALESCE(reapplication_cooldown_days, 30),
    slots_filled = COALESCE(slots_filled, '{
        "solo": { "accepted": 0, "applicant_ids": [] },
        "duo": { "accepted": 0, "applicant_ids": [] },
        "band": { "accepted": 0, "applicant_ids": [] }
    }'::jsonb),
    total_slots_filled = COALESCE(total_slots_filled, 0)
WHERE reapplication_cooldown_days IS NULL 
   OR slots_filled IS NULL 
   OR total_slots_filled IS NULL;
