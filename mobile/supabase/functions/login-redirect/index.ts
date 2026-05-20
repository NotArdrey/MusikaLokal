// @ts-nocheck
/**
 * Login Redirect Edge Function
 *
 * Shows a success page after email verification, then opens the app deep link.
 * The visible button keeps the flow usable when mobile browsers block automatic
 * custom-scheme redirects.
 */
Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    const rawAppUrl = url.searchParams.get("app_url") || "";
    const defaultAppUrl = "musikalokal://?verified=true";
    let appUrl = defaultAppUrl;

    try {
        const parsed = new URL(rawAppUrl || defaultAppUrl);
        const protocol = parsed.protocol.replace(/:$/, "");
        const isAllowedNativeScheme = ["musikalokal", "exp", "exps"].includes(protocol);
        const isAllowedLocalWeb =
            ["http", "https"].includes(protocol) &&
            ["localhost", "127.0.0.1"].includes(parsed.hostname);

        if (isAllowedNativeScheme || isAllowedLocalWeb) {
            appUrl = parsed.toString();
        }
    } catch {
        appUrl = defaultAppUrl;
    }

    const safeAppUrl = appUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const appUrlScript = JSON.stringify(appUrl);

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
        <h1>Verification Complete</h1>
        <p>Your email has been confirmed successfully.</p>
        <a href="${safeAppUrl}" class="btn">Open MusikaLokal App</a>
    </div>
    <script>
        setTimeout(function() {
            window.location.href = ${appUrlScript};
        }, 1000);
    </script>
</body>
</html>`;

    return new Response(html.trim(), {
        status: 200,
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    });
});
