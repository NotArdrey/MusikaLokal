Deno.serve(async (req) => {
    const url = new URL(req.url);
    const redirectTo = url.searchParams.get('redirect_to');

    // Collect other parameters to forward (like status, message from Didit)
    const params = new URLSearchParams(url.searchParams);
    params.delete('redirect_to');
    const otherParams = params.toString();

    if (redirectTo) {
        let finalUrl = decodeURIComponent(redirectTo);
        // Append params correctly (handle existing ? or not)
        if (otherParams) {
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + otherParams;
        }

        // Dynamic redirect requested by client (e.g. for Expo Go)
        return new Response(null, {
            status: 302,
            headers: { "Location": finalUrl },
        });
    }

    // Fallback to the static HTML file hosted on Supabase Storage
    // This bypasses Edge Function raw HTML rendering issues
    const storageUrl = "https://aefldxegsvzecshlayza.supabase.co/storage/v1/object/public/public-assets/verification-v2.html";

    return new Response(null, {
        status: 302,
        headers: { "Location": storageUrl },
    });
});
