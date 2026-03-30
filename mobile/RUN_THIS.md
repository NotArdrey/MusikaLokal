# 🚀 Setup Instructions

## Step 1: Run Main Schema
**Supabase Dashboard → SQL Editor**

Copy and paste the entire `supabase_schema.sql` file, then click **Run**.

This will:
- ✅ Create all 3NF-compliant tables
- ✅ Create booking system functions
- ✅ Initialize default settings for studios
- ✅ Set default Mon-Fri 9am-5pm hours

---

## Step 2: Setup Cron Job
**Supabase Dashboard → SQL Editor**

Run this to auto-cleanup expired cart holds:

```sql
SELECT cron.schedule(
  'cleanup-expired-booking-holds',
  '* * * * *',
  $$ SELECT cleanup_expired_holds(); $$
);
```

---

## Step 3: Update View (Optional)
**Supabase Dashboard → SQL Editor**

```sql
CREATE OR REPLACE VIEW studio_bookings_with_cost AS
SELECT 
  sb.*,
  s.name as studio_name,
  s.images as studio_images,
  s.hourly_rate
FROM studio_bookings sb
LEFT JOIN studios s ON sb.studio_id = s.id;
```

---

## ✅ Done!

Your 3NF booking system is ready with:
- Operating hours (weekly + date overrides)
- Buffer times between bookings
- Soft holds (10-min cart expiry)
- Dynamic pricing (weekend/late-night/bulk discounts)
- Lead time & booking horizon

See `BOOKING_SYSTEM_ARCHITECTURE.md` for full documentation.
