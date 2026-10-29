// Sends Web Push notifications. Called every 5 minutes by pg_cron (see supabase/README.md).
//   1. Daily reading reminders: who is due is decided by public.due_reminders() (core/notifications.ts).
//   2. Social notifications (comments, reactions, follows): public.take_social_pushes() applies each
//      user's switches, quiet hours and daily cap, and marks them handled so nothing is sent twice.
//
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase), CRON_SECRET,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { reminderMessage, socialMessage } from '../_shared/messages.ts';

interface Target {
  user_id: string;
  local_date: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
};

/** Send one message to every subscription of one user. True when at least one device got it. */
async function deliver(supabase: SupabaseClient, rows: Target[], message: { title: string; body: string; url: string }) {
  let delivered = false;
  for (const row of rows) {
    if (!row.p256dh || !row.auth) continue;
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(message),
        { TTL: 60 * 60 * 4 },
      );
      delivered = true;
      await supabase.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', row.subscription_id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410: the browser dropped this subscription; forget it.
      if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('id', row.subscription_id);
      else console.error('push failed', status, (err as Error).message);
    }
  }
  return delivered;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) out.set(key(row), [...(out.get(key(row)) ?? []), row]);
  return out;
}

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  // 1. Reminders
  const reminders = await supabase.rpc('due_reminders');
  if (reminders.error) return new Response(reminders.error.message, { status: 500 });
  let remindersSent = 0;
  for (const [userId, rows] of groupBy((reminders.data ?? []) as Array<Target & { platform: string }>, (r) => r.user_id)) {
    const web = rows.filter((r) => r.platform === 'web');
    const message = reminderMessage('en', Number(rows[0]!.local_date.replaceAll('-', '')));
    if (await deliver(supabase, web, { ...message, url: '/' })) {
      await supabase.rpc('log_notification', { p_user: userId, p_kind: 'reminder', p_local_date: rows[0]!.local_date });
      remindersSent++;
    }
  }

  // 2. Social
  const social = await supabase.rpc('take_social_pushes');
  if (social.error) return new Response(social.error.message, { status: 500 });
  let socialSent = 0;
  type SocialRow = Target & { notification_id: number; kind: string; actor_name: string };
  for (const [, rows] of groupBy((social.data ?? []) as SocialRow[], (r) => String(r.notification_id))) {
    const first = rows[0]!;
    const message = socialMessage('en', first.kind, first.actor_name);
    const url = '/feed/notifications';
    if (await deliver(supabase, rows, { ...message, url })) {
      const kind = first.kind.startsWith('follow') ? 'follow' : first.kind;
      await supabase.rpc('log_notification', { p_user: first.user_id, p_kind: kind, p_local_date: first.local_date });
      socialSent++;
    }
  }

  return Response.json({ remindersSent, socialSent });
});
