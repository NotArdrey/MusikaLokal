// @ts-nocheck
Deno.serve(async (req) => {
    const url = new URL(req.url);
    const redirectTo = url.searchParams.get('redirect_to');

    // Collect other parameters to forward (like status, message from Didit)
    const params = new URLSearchParams(url.searchParams);
    params.delete('redirect_to');
    const otherParams = params.toString();

    // 1. DYNAMIC REDIRECT (Back to App)
    if (redirectTo) {
        let finalUrl = decodeURIComponent(redirectTo);
        // Append params correctly (handle existing ? or not)
        if (otherParams) {
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + otherParams;
        }

        // Use a 302 Found redirect - this tells the browser "Go here" immediately
        // preventing it from trying to render the text as HTML
        return new Response(null, {
            status: 302,
            headers: { "Location": finalUrl },
        });
    }

    // 2. FALLBACK (Static Success Page)
    // Fetch the HTML from storage and serve it directly with the correct Content-Type
    // This prevents the "Raw HTML" display issue and keeps the URL as 'verification-redirect'
    // which helps the app's interceptor catch it.
    const storageUrl = "https://aefldxegsvzecshlayza.supabase.co/storage/v1/object/public/public-assets/verification-v2.html";

    try {
        const htmlResponse = await fetch(storageUrl);
        const htmlContent = await htmlResponse.text();

        return new Response(htmlContent, {
            status: 200,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                // Prevent caching so status parameters are always processed newly
                "Cache-Control": "no-cache, no-store, must-revalidate"
            },
        });
    } catch (e) {
        // Emergency fallback if storage is down
        return new Response("<html><body><h1>Verification Complete</h1><p>You can return to the app.</p></body></html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
        });
    }
});
