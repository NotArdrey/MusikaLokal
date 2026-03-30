
// Minimal test function with no external imports
// @ts-ignore
Deno.serve(async (req) => {
    return new Response(JSON.stringify({ message: "Hello from test function" }), {
        headers: { "Content-Type": "application/json" },
    })
})
