import { env, json } from '../../shared/omniShared.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge') || '';
  if (mode === 'subscribe' && token === env('META_VERIFY_TOKEN')) {
    return new Response(challenge, { status: 200 });
  }
  return json({ error: 'Meta webhook verification failed' }, 403);
});
