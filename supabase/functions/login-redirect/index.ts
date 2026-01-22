// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

/**
 * Login Redirect Edge Function
 * 
 * Shows a page to return users back to the app's login screen.
 * Deep links don't work in Expo Go, so we show a manual return page.
 */
serve(async (req: Request) => {
    const deepLinkUrl = 'musikalokal://';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Return to MusikaLokal</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            max-width: 400px;
            width: 100%;
        }
        .emoji { font-size: 64px; margin-bottom: 20px; }
        h1 { color: white; font-size: 24px; margin-bottom: 12px; }
        p { color: rgba(255,255,255,0.8); font-size: 16px; margin-bottom: 24px; }
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 16px;
        }
        .note { margin-top: 20px; color: rgba(255,255,255,0.6); font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">🎵</div>
        <h1>Return to App</h1>
        <p>Tap the button below or close this browser to return to MusikaLokal.</p>
        <a href="${deepLinkUrl}" class="btn">Open MusikaLokal</a>
        <p class="note">If the button doesn't work, close this browser and open the app manually.</p>
    </div>
</body>
</html>`;

    return new Response(htmlContent, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    });
});
