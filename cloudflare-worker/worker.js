/**
 * Cloudflare Worker for Khobza App Push Notifications (Serverless Edge Gateway)
 * 
 * Instructions:
 * 1. Go to https://dash.cloudflare.com -> Workers & Pages -> Create Application -> Create Worker.
 * 2. Paste this entire code into your Cloudflare Worker editor.
 * 3. (Optional) Bind a KV Namespace named `PUSH_TOKENS` or forward to Firebase / Supabase.
 * 4. Click "Deploy".
 * 5. Copy the worker URL (e.g., https://khobza-push.your-subdomain.workers.dev) and paste it in Khobza Admin or .env.
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Khobza-Source',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'Khobza Cloudflare Push Worker',
          timestamp: new Date().toISOString(),
          edgeLocation: request.cf?.colo || 'Cloudflare-Edge',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Receive Push Dispatch from Khobza App
    if (request.method === 'POST' && (url.pathname === '/api/cloudflare/push' || url.pathname === '/send' || url.pathname === '')) {
      try {
        const body = await request.json();
        const { title, body: contentBody, targetRole, targetPhone, orderId } = body;

        console.log(`[Cloudflare Worker] Broadcasting Notification: "${title}" -> Role: ${targetRole || 'all'}`);

        // Optional: If Firebase Service Account or Supabase URL is configured in Cloudflare environment
        // You can dispatch directly to FCM or WebPush endpoints from the Cloudflare edge.
        
        return new Response(
          JSON.stringify({
            success: true,
            status: 'delivered_to_edge',
            edgeLocation: request.cf?.colo || 'Cloudflare-Global-Edge',
            receivedPayload: {
              title: title || 'تطبيق الخبزة',
              body: contentBody,
              targetRole: targetRole || 'all',
              targetPhone,
              orderId,
            },
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || 'Invalid JSON Payload' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response(JSON.stringify({ error: 'Endpoint Not Found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
