// @ts-nocheck
/**
 * Login Redirect Edge Function
 * 
 * Direct 302 redirect to the app's login screen after email verification.
 * Passes ?verified=true to trigger success alert in the app.
 */
Deno.serve(async (req: Request) => {
    // Serve a nice HTML success page
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Complete</title>
    <style>
        body { font-family: -apple-system, sans-serif; background: #121212; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; }
        .container { padding: 20px; }
        h1 { color: #22c55e; }
        p { color: #9ca3af; margin-bottom: 30px; }
        .btn { background: #22c55e; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; cursor: pointer; }
    </style>
</head>
<body>
    <div class="container">
        <h1>✅ Verification Complete!</h1>
        <p>Your email has been confirmed successfully.</p>
        <a href="musikalokal://?verified=true" class="btn">Open MusikaLokal App</a>
    </div>
    <script>
        // Attempt auto-redirect
        setTimeout(function() {
            window.location.href = "musikalokal://?verified=true";
        }, 1000);
    </script>
</body>
</html>`;

    return new Response(html.trim(), {
        status: 200,
        headers: {
            "Content-Type": "text/html; charset=utf-8"
        }
    });
});
