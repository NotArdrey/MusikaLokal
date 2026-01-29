// @ts-nocheck
Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    const redirectTo = url.searchParams.get('redirect_to');

    // Collect other parameters to forward (like status, message from Didit)
    const params = new URLSearchParams(url.searchParams);
    params.delete('redirect_to');
    const otherParams = params.toString();

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Successful</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Poppins', sans-serif; background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #F8FAFC; margin: 0; }
            .container { text-align: center; padding: 40px; max-width: 400px; width: 90%; background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; backdrop-filter: blur(10px); }
            .logo { font-size: 64px; margin-bottom: 24px; }
            h1 { font-size: 28px; font-weight: 700; margin-bottom: 16px; color: #F8FAFC; }
            p { font-size: 16px; color: #94A3B8; margin-bottom: 24px; line-height: 1.6; }
            .btn { display: inline-block; background: #4F46E5; color: white; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; transition: all 0.2s; width: 100%; margin-bottom: 12px; box-sizing: border-box; }
            .btn:hover { background: #4338CA; transform: translateY(-2px); }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">✅</div>
            <h1>Successfully Verified!</h1>
            <p>Your identity has been confirmed. You will be redirected to the app automatically.</p>
            <a id="applink" href="#" class="btn">Open App</a>
        </div>
        <script>
            // Get params from URL
            const urlParams = new URLSearchParams(window.location.search);
            const redirectTo = urlParams.get('redirect_to');
            // Reconstruct the full redirect URL (handling encoded params correctly)
            let finalUrl = redirectTo ? decodeURIComponent(redirectTo) : 'musikalokal://?verified=true';
            
            // Add other params back if needed (except redirect_to)
            const otherParams = [];
            urlParams.forEach((value, key) => {
                if (key !== 'redirect_to') otherParams.push(key + '=' + encodeURIComponent(value));
            });
            
            if (otherParams.length > 0) {
               finalUrl += (finalUrl.includes('?') ? '&' : '?') + otherParams.join('&');
            }

            // Set button link
            const appLink = document.getElementById('applink');
            appLink.href = finalUrl;
            
            // Auto redirect
            setTimeout(() => {
                window.location.href = finalUrl;
            }, 1500);
        </script>
    </body>
    </html>`;

    return new Response(htmlContent, {
        status: 200,
        headers: {
            "Content-Type": "text/html",
            "Cache-Control": "no-cache, no-store, must-revalidate"
        },
    });
});
