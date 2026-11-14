// Preview-only readiness check. Remove before merging the feature to production.
export const dynamic = 'force-dynamic';

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return Response.json({ available: false }, { status: 503 });
  try {
    const url = new URL('/auth/v1/settings', base);
    if (!url.hostname.endsWith('.supabase.co') || url.protocol !== 'https:') {
      return Response.json({ available: false }, { status: 400 });
    }
    const response = await fetch(url, { headers: { apikey: key }, cache: 'no-store' });
    if (!response.ok) return Response.json({ available: false }, { status: 502 });
    const settings = await response.json();
    return Response.json({ available: true, mailer_autoconfirm: settings.mailer_autoconfirm, email_enabled: settings.external?.email });
  } catch {
    return Response.json({ available: false }, { status: 502 });
  }
}
