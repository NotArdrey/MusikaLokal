// @ts-nocheck
/**
 * Address Verification Redirect Handler
 * 
 * This function handles the redirect from Didit after address verification completion.
 * It shows a success/failure page and redirects the user back to the app.
 */

Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    const redirectTo = url.searchParams.get('redirect_to');
    const vendorData = url.searchParams.get('vendor_data');
    const entityType = url.searchParams.get('entity_type');
    const entityId = url.searchParams.get('entity_id');
    const status = url.searchParams.get('status') || 'completed';

    // Build the final redirect URL with all params
    let finalUrl = redirectTo ? decodeURIComponent(redirectTo) : 'musikalokal://address-verified';
    
    // Add verification info to redirect URL
    const params = new URLSearchParams();
    params.set('address_verified', 'true');
    params.set('entity_type', entityType || '');
    params.set('entity_id', entityId || '');
    params.set('status', status);
    
    finalUrl += (finalUrl.includes('?') ? '&' : '?') + params.toString();

    const isSuccess = status !== 'declined' && status !== 'abandoned';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Address Verification ${isSuccess ? 'Successful' : 'Failed'}</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            body { 
                font-family: 'Poppins', sans-serif; 
                background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); 
                min-height: 100vh; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                color: #F8FAFC; 
                margin: 0; 
            }
            .container { 
                text-align: center; 
                padding: 40px; 
                max-width: 400px; 
                width: 90%; 
                background: rgba(30, 41, 59, 0.5); 
                border: 1px solid rgba(255, 255, 255, 0.1); 
                border-radius: 24px; 
                backdrop-filter: blur(10px); 
            }
            .logo { font-size: 64px; margin-bottom: 24px; }
            h1 { font-size: 28px; font-weight: 700; margin-bottom: 16px; color: #F8FAFC; }
            p { font-size: 16px; color: #94A3B8; margin-bottom: 24px; line-height: 1.6; }
            .btn { 
                display: inline-block; 
                background: ${isSuccess ? '#4F46E5' : '#EF4444'}; 
                color: white; 
                text-decoration: none; 
                padding: 16px 32px; 
                border-radius: 12px; 
                font-weight: 600; 
                transition: all 0.2s; 
                width: 100%; 
                margin-bottom: 12px; 
                box-sizing: border-box; 
            }
            .btn:hover { 
                background: ${isSuccess ? '#4338CA' : '#DC2626'}; 
                transform: translateY(-2px); 
            }
            .info-box {
                background: rgba(79, 70, 229, 0.1);
                border: 1px solid rgba(79, 70, 229, 0.3);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 24px;
            }
            .info-label {
                font-size: 12px;
                color: #94A3B8;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .info-value {
                font-size: 14px;
                color: #F8FAFC;
                margin-top: 4px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">${isSuccess ? '📍✅' : '📍❌'}</div>
            <h1>${isSuccess ? 'Address Verified!' : 'Verification Failed'}</h1>
            <p>${isSuccess 
                ? 'Your address has been successfully verified. Your listing will be reviewed and approved shortly.' 
                : 'We could not verify your address. Please try again with a valid utility bill.'}</p>
            
            ${entityType ? `
            <div class="info-box">
                <div class="info-label">Verifying</div>
                <div class="info-value">${entityType === 'studio' ? 'Studio' : 'Venue'} Address</div>
            </div>
            ` : ''}
            
            <a id="applink" href="#" class="btn">Return to App</a>
        </div>
        <script>
            const finalUrl = "${finalUrl.replace(/"/g, '\\"')}";
            
            // Set button link
            document.getElementById('applink').href = finalUrl;
            
            // Auto redirect after 2 seconds
            setTimeout(() => {
                window.location.href = finalUrl;
            }, 2000);
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
