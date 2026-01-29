
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const BUCKET_NAME = 'public-assets';
        const FILE_NAME = 'verification-v2.html';

        // 1. Create Bucket if not exists
        const { data: buckets, error: listError } = await supabase.storage.listBuckets();
        if (listError) throw listError;

        const bucketExists = buckets.some(b => b.name === BUCKET_NAME);

        if (!bucketExists) {
            console.log(`Creating bucket ${BUCKET_NAME}...`);
            const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
                public: true,
                fileSizeLimit: 1048576, // 1MB
                allowedMimeTypes: ['text/html'],
            });
            if (createError) throw createError;
        }

        // 2. Upload File
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Successful</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Poppins', sans-serif; background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #F8FAFC; margin: 0; }
        .container { text-align: center; padding: 40px; max-width: 400px; width: 90%; background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; backdrop-filter: blur(10px); }
        .logo { font-size: 64px; margin-bottom: 24px; }
        h1 { font-size: 28px; font-weight: 700; margin-bottom: 16px; color: #F8FAFC; }
        p { font-size: 16px; color: #94A3B8; margin-bottom: 24px; line-height: 1.6; }
        .btn { display: inline-block; background: #4F46E5; color: white; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; transition: all 0.2s; width: 100%; margin-bottom: 12px; }
        .btn:hover { background: #4338CA; transform: translateY(-2px); }
        .secondary-action { margin-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 20px; }
        .expo-input { width: 100%; padding: 12px; border-radius: 8px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.1); color: white; margin-bottom: 8px; font-family: inherit; }
        .small-text { font-size: 12px; color: #64748B; margin-bottom: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎉</div>
        <h1>Successfully Verified!</h1>
        <p>Your email has been confirmed. You will be redirected to the app automatically.</p>
        <a id="appLink" href="#" class="btn">Open App</a>
        <div class="secondary-action">
            <p class="small-text">Development Testing (Expo Go)</p>
            <input type="text" id="expoUrl" class="expo-input" placeholder="exp://192.168.x.x:8081">
            <button onclick="openExpo()" class="btn" style="background: #334155; font-size: 14px; padding: 12px;">Open in Expo Go</button>
        </div>
    </div>
    <script>
        const APP_SCHEME = "musikalokal://";
        const PATH = "?verified=true";
        const appLink = document.getElementById('appLink');
        appLink.href = APP_SCHEME + PATH;
        
        setTimeout(() => { window.location.href = APP_SCHEME + PATH; }, 2000);

        function openExpo() {
            const input = document.getElementById('expoUrl');
            let url = input.value.trim();
            if (!url) return alert('Please enter your Expo Go URL');
            if (!url.startsWith('exp://')) url = 'exp://' + url;
            if (!url.includes('/--/')) url += url.endsWith('/') ? '--/' : '/--/';
            window.location.href = url + PATH;
        }
    </script>
</body>
</html>`;

        console.log('Uploading file...');
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(FILE_NAME, htmlContent, {
                contentType: 'text/html',
                upsert: true,
                cacheControl: '3600'
            });

        if (uploadError) throw uploadError;

        // 3. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(FILE_NAME);

        console.log('Public URL:', publicUrl);

        return new Response(JSON.stringify({ success: true, publicUrl }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
