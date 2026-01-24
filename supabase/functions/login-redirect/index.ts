/**
 * Login Redirect Edge Function
 * 
 * Direct 302 redirect to the app's login screen after email verification.
 * Passes ?verified=true to trigger success alert in the app.
 */
Deno.serve(async (req: Request) => {
    // Direct 302 redirect to app with verified parameter
    return new Response(null, {
        status: 302,
        headers: {
            "Location": "musikalokal://login?verified=true"
        },
    });
});
