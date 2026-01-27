# Professional Booking System Architecture

## 3NF Database Compliance ✓

### Normalization Verification

#### **1st Normal Form (1NF)**
- ✅ All tables have primary keys
- ✅ All columns contain atomic values (no arrays except where appropriate for PostgreSQL)
- ✅ No repeating groups

#### **2nd Normal Form (2NF)**
- ✅ All non-key attributes depend on the **entire** primary key
- ✅ No partial dependencies exist

#### **3rd Normal Form (3NF)**
- ✅ No transitive dependencies
- ✅ Non-key columns don't depend on other non-key columns
- ✅ Each table represents a single entity or relationship

### Schema Structure

```
studios (core entity)
  ├── studio_settings (1:1, booking rules)
  ├── studio_operating_hours (1:7, weekly schedule)
  ├── studio_date_overrides (1:N, exceptions)
  ├── studio_bookings (1:N, confirmed bookings)
  └── booking_holds (1:N, temporary locks)
```

### 3NF Examples

**✅ CORRECT (3NF):**
```sql
studios: id, name, hourly_rate, address
studio_settings: studio_id, buffer_minutes, slot_increment_minutes
```
- Settings are separated from core studio data
- No update anomalies

**❌ INCORRECT (Violates 3NF):**
```sql
studios: id, name, hourly_rate, buffer_minutes, slot_increment_minutes
```
- Mixing entity data with configuration rules
- Update anomalies possible

---

## Part 1: Studio Owner Logic

### 1. Operating Hours System

**Weekly Template** (`studio_operating_hours`)
```sql
studio_id | day_of_week | is_open | open_time | close_time
----------|-------------|---------|-----------|------------
abc-123   | 1 (Mon)     | true    | 09:00     | 21:00
abc-123   | 0 (Sun)     | false   | NULL      | NULL
```

**Date Overrides** (`studio_date_overrides`)
```sql
studio_id | override_date | is_open | open_time | close_time | reason
----------|---------------|---------|-----------|------------|------------------
abc-123   | 2026-12-25    | false   | NULL      | NULL       | Christmas Closed
abc-123   | 2026-12-31    | true    | 18:00     | 02:00      | New Year Special
```

**Hierarchy:** Date Override > Weekly Template

### 2. Grid & Granularity (`studio_settings`)

```sql
slot_increment_minutes: 30  -- Snap to :00 or :30
min_booking_duration_hours: 2.0  -- Minimum session
max_booking_duration_hours: 12.0  -- Maximum session
```

**Effect:** UI only shows times like 13:00, 13:30, 14:00 (never 13:15)

### 3. Buffer Time (Automated Padding)

```sql
buffer_minutes: 30  -- Cleanup time after each booking
```

**Logic in `is_slot_available()` function:**
```sql
-- Check if new booking overlaps with (existing_booking + buffer)
(start_time, (end_time + buffer_minutes)::INTERVAL) OVERLAPS (requested_start, requested_end)
```

**Example:**
- Booking: 14:00 - 16:00
- Buffer: 30 minutes
- **Blocked until:** 16:30
- Next available: 16:30

### 4. Lead Time & Booking Horizon

```sql
lead_time_hours: 24  -- Minimum advance notice
booking_horizon_days: 90  -- Maximum days ahead
```

**Enforced:** UI filters out unavailable dates before displaying

---

## Part 2: Musician Logic

### 1. Availability Calculation

**SQL Function: `is_slot_available(studio_id, date, start, end, user_id)`**

```
1. Get day of week → Check weekly schedule
2. Check for date override → Use if exists
3. Verify time is within operating hours
4. Check existing bookings + buffers → No overlap
5. Check active holds (excluding user's own) → No overlap
6. Return TRUE if all checks pass
```

### 2. Soft Hold System (`booking_holds`)

**Cart Workflow:**
```
User clicks "Add Session"
  ↓
INSERT INTO booking_holds (
  user_id,
  studio_id, 
  booking_date,
  start_time,
  end_time,
  expires_at = NOW() + INTERVAL '10 minutes'
)
  ↓
Slot appears "Unavailable" to other users
  ↓
If checkout completes → Move to studio_bookings
If timeout expires → Auto-deleted by cleanup_expired_holds()
```

**Table Structure:**
```sql
CREATE TABLE booking_holds (
  id UUID PRIMARY KEY,
  user_id UUID,
  studio_id UUID,
  booking_date DATE,
  start_time TIME,
  end_time TIME,
  expires_at TIMESTAMPTZ,  -- Key field for auto-cleanup
  created_at TIMESTAMPTZ
);

CREATE INDEX idx_booking_holds_expiry ON booking_holds(expires_at);
```

**Cleanup (Cron Job):**
```sql
-- Run every minute via Supabase pg_cron
SELECT cron.schedule('cleanup-holds', '* * * * *', 'SELECT cleanup_expired_holds()');
```

### 3. Self-Conflict Detection

**Frontend Logic:**
```typescript
const hasConflict = (newSlot, existingCart) => {
  return existingCart.some(existing => 
    existing.date === newSlot.date &&
    timesOverlap(existing.start, existing.end, newSlot.start, newSlot.end)
  );
};

if (hasConflict(newSlot, cart)) {
  alert("You already have a booking at this time!");
  return;
}
```

### 4. Dynamic Pricing Engine

**SQL Function: `calculate_booking_price(studio_id, date, start, end, total_cart_hours)`**

```sql
Returns: {
  base_rate: 500,
  hours: 3.0,
  subtotal: 1500,
  modifiers: {
    "weekend_multiplier": 1.2,
    "bulk_discount": "10%"
  },
  final_price: 1620  -- (1500 * 1.2) * 0.9
}
```

**Pricing Logic:**
```
1. Base calculation: hourly_rate × duration
2. Apply weekend multiplier (if Saturday/Sunday)
3. Apply late night multiplier (if start >= 22:00)
4. Apply bulk discount (if total_cart_hours >= threshold)
5. Store final price + modifiers in studio_bookings
```

**Why store pricing in bookings?**
- **Transparency:** User sees what they paid
- **Audit trail:** Prices can change over time
- **3NF compliant:** No recalculation dependencies

---

## Database Functions Reference

### `is_slot_available()`
**Purpose:** Check if a time slot can be booked
**Returns:** BOOLEAN
**Checks:** Operating hours, overrides, bookings, holds, buffers

### `calculate_booking_price()`
**Purpose:** Calculate final price with all modifiers
**Returns:** TABLE with breakdown
**Includes:** Base rate, hours, subtotal, modifiers, final price

### `cleanup_expired_holds()`
**Purpose:** Remove expired cart items
**Schedule:** Every 1 minute via cron
**Effect:** Releases slots back to availability pool

---

## Implementation Checklist

### Database Setup
- [x] Create all normalized tables (3NF)
- [x] Add indexes for performance
- [x] Create helper functions
- [ ] Set up pg_cron for hold cleanup
- [ ] Initialize default settings for existing studios

### Studio Owner Features
- [ ] Settings page for configuring booking rules
- [ ] Weekly schedule editor (7 days)
- [ ] Date override calendar
- [ ] Pricing modifiers UI

### Musician Features
- [ ] Availability calendar with real-time checks
- [ ] Cart system with soft holds
- [ ] Conflict detection
- [ ] Price breakdown display

### Edge Functions
- [ ] Create booking with price calculation
- [ ] Add to cart (create hold)
- [ ] Checkout (convert holds to bookings)
- [ ] Get available slots for date range

---

## Migration Steps

### 1. Run Enhanced Schema
```bash
# Execute the enhanced booking schema
psql -d your_database -f supabase/enhanced_booking_schema.sql
```

### 2. Initialize Default Settings
```sql
-- Already included in schema:
-- - Default studio_settings for all studios
-- - Default Mon-Fri 9am-5pm schedule
```

### 3. Update Views
```sql
-- Update studio_bookings_with_cost view to use new pricing fields
CREATE OR REPLACE VIEW studio_bookings_with_cost AS
SELECT 
  sb.*,
  s.name as studio_name,
  s.images as studio_images
FROM studio_bookings sb
LEFT JOIN studios s ON sb.studio_id = s.id;
```

### 4. Set Up Cron Job
```sql
-- In Supabase Dashboard → Database → Extensions → Enable pg_cron
SELECT cron.schedule(
  'cleanup-booking-holds',
  '* * * * *',  -- Every minute
  $$ SELECT cleanup_expired_holds(); $$
);
```

---

## Performance Considerations

### Indexes
```sql
-- Critical for availability queries
CREATE INDEX idx_studio_bookings_studio_date ON studio_bookings(studio_id, booking_date);
CREATE INDEX idx_booking_holds_studio_date ON booking_holds(studio_id, booking_date);
CREATE INDEX idx_booking_holds_expiry ON booking_holds(expires_at);
```

### Query Optimization
- Use prepared statements for `is_slot_available()`
- Cache studio settings in application layer
- Use materialized views for analytics

---

## Testing Scenarios

### Test Case 1: Buffer Time
```
Given: Studio has 30-minute buffer
When: Booking exists 14:00-16:00
Then: Next available slot starts at 16:30
```

### Test Case 2: Date Override
```
Given: Normal hours Mon-Fri 9am-5pm
And: Override for Dec 25: Closed
When: User checks Dec 25
Then: No slots available
```

### Test Case 3: Soft Hold Expiration
```
Given: User adds slot to cart at 10:00am
And: Hold timeout is 10 minutes
When: Clock reaches 10:10am
Then: Slot becomes available to others
```

### Test Case 4: Pricing Modifiers
```
Given: Base rate ₱500/hr
And: Weekend multiplier 1.2
And: Bulk discount 10% for 10+ hours
When: User books 12 hours on Saturday
Then: Final price = (500 × 12 × 1.2) × 0.9 = ₱6,480
```

---

## Security Considerations

### Row Level Security (RLS)

```sql
-- Users can only see their own holds
ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY holds_owner_policy ON booking_holds
  FOR SELECT USING (auth.uid() = user_id);

-- Studio owners can see holds for their studios
CREATE POLICY holds_studio_owner_policy ON booking_holds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM studios 
      WHERE studios.id = booking_holds.studio_id 
      AND studios.owner_id = auth.uid()
    )
  );
```

---

This architecture ensures a robust, scalable, and conflict-free booking system while maintaining database best practices (3NF) and providing excellent user experience.
