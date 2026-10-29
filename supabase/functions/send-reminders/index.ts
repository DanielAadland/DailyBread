// Sends the daily reading reminder by Web Push. Called every 15 minutes by pg_cron (see supabase/README.md).
// Which users are due is decided in SQL by public.due_reminders() (the rules of core/notifications.ts).
//
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase), CRON_SECRET,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { reminderMessage } from '../_shared/messages.ts';

interface DueRow {
  user_id: string;
  local_date: string;
  subscription_id: string;
  platform: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
};

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc('due_reminders');
  if (error) return new Response(error.message, { status: 500 });

  const byUser = new Map<string, DueRow[]>();
  for (const row of (data ?? []) as DueRow[]) {
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
  }

  let sent = 0;
  for (const [userId, rows] of byUser) {
    const day = Number(rows[0]!.local_date.replaceAll('-', ''));
    const message = reminderMessage('en', day);
    let delivered = false;

    for (const row of rows) {
      if (row.platform !== 'web' || !row.p256dh || !row.auth) continue; // Expo/desktop push: Phase 5–6
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify({ title: message.title, body: message.body, url: '/' }),
          { TTL: 60 * 60 * 4 },
        );
        delivered = true;
        await supabase.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', row.subscription_id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the browser dropped this subscription; forget it.
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', row.subscription_id);
        } else {
          console.error('push failed', status, (err as Error).message);
        }
      }
    }

    if (delivered) {
      await supabase.rpc('log_notification', { p_user: userId, p_kind: 'reminder', p_local_date: rows[0]!.local_date });
      sent++;
    }
  }

  return Response.json({ due: byUser.size, sent });
});
