---
description: Auto-generate full stack Didit verification (Supabase Backend + Flutter Frontend)
---

# Part 1: Backend Setup (Supabase)

1. Create a new migration file (e.g., `supabase/migrations/20240101000000_init_didit.sql`) with the following content:
```sql
-- 1. Table for holding signups before they are verified
create table public.pending_signups (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  email text not null,
  password_hash text not null, -- Stores raw password temporarily until user is created
  didit_session_id text
);

-- 2. Profiles table (standard user profile)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  email text,
  full_name text,
  is_verified boolean default false,
  id_document_expiry text,
  id_verified_at timestamp with time zone
);

-- 3. Enable RLS (Security)
alter table public.pending_signups enable row level security;
alter table public.profiles enable row level security;

-- Allow anyone to insert into pending_signups (for signup)
create policy "Enable insert for all" on public.pending_signups for insert with check (true);
```

2. Create the directory `supabase/functions/didit-webhook` if it doesn't exist.

3. Create the file `supabase/functions/didit-webhook/index.ts` with the following content:
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })

  try {
    const payload = await req.json()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { session_id, status, decision } = payload

    // A. Link Session ID to Pending Signup
    if (status === 'Not Started' && payload.webhook_type === 'status.updated') {
      const { data: pending } = await supabase
        .from('pending_signups')
        .select('id')
        .is('didit_session_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (pending) {
        await supabase.from('pending_signups').update({ didit_session_id: session_id }).eq('id', pending.id)
      }
      return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
    }

    // B. Handle Approval
    if (decision?.face_matches?.[0]?.status === 'Approved') {
       const { data: pending } = await supabase
        .from('pending_signups').select('*').eq('didit_session_id', session_id).single()
       
       if (pending) {
          const { data: user, error: createError } = await supabase.auth.admin.createUser({
            email: pending.email,
            password: pending.password_hash,
            email_confirm: true
          })

          if (!createError && user.user) {
             await supabase.from('profiles').insert({
               id: user.user.id,
               email: pending.email,
               is_verified: true,
               full_name: decision.id_verifications?.[0]?.first_name
             })
             
             await supabase.from('pending_signups').delete().eq('id', pending.id)
          }
       }
    }

    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
```

# Part 2: Frontend Setup (Flutter)

4. Create the file `lib/screens/signup_screen.dart` (or similar path) with the registration logic:
```dart
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});
  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();

  Future<void> _signUp() async {
    // 1. Insert into pending_signups
    final res = await Supabase.instance.client
        .from('pending_signups')
        .insert({
          'email': _email.text,
          'password_hash': _password.text
        })
        .select()
        .single();
    
    final id = res['id'];

    if (id != null) {
        // 2. Launch Didit Verification
        const baseUrl = 'https://verify.didit.me/verify/kxYhKHgC1LESNW-TQEmPcw';
        final redirect = 'netisend://verification-complete';
        final url = '$baseUrl?reference=$id&redirect_uri=$redirect';
        
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sign Up')),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
            TextField(controller: _password, decoration: const InputDecoration(labelText: 'Password'), obscureText: true),
            const SizedBox(height: 20),
            ElevatedButton(onPressed: _signUp, child: const Text("Sign Up"))
          ],
        ),
      )
    );
  }
}
```

5. **Manual Action Required**:
   - Add dependencies: `flutter pub add supabase_flutter url_launcher app_links`
   - Update `android/app/src/main/AndroidManifest.xml` with the intent-filter for `netisend`.
   - Update `ios/Runner/Info.plist` with the URL types for `netisend`.
   - Update `main.dart` to initialize Supabase and listen for the deep link.

