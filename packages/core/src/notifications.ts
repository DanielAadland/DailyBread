import { localMinutes, parseTimeOfDay } from './dates';

export interface NotificationSettings {
  timeZone: string;
  remindersEnabled: boolean;
  /** "HH:MM", 24h, in the user's timezone. */
  reminderTime: string;
  /** Quiet hours, "HH:MM". Equal or null values mean no quiet hours. May wrap past midnight. */
  quietStart: string | null;
  quietEnd: string | null;
  /** Most notifications of any kind sent per local day. */
  dailyCap: number;
  social: {
    comments: boolean;
    reactions: boolean;
    nudges: boolean;
    groupActivity: boolean;
  };
}

export const DEFAULT_NOTIFICATION_SETTINGS: Omit<NotificationSettings, 'timeZone'> = {
  remindersEnabled: true,
  reminderTime: '08:00',
  quietStart: '22:00',
  quietEnd: '07:00',
  dailyCap: 3,
  social: { comments: true, reactions: false, nudges: true, groupActivity: true },
};

/** The reminder job runs every 15 minutes; a reminder is due within this window after the chosen time. */
export const REMINDER_WINDOW_MINUTES = 15;

export function inQuietHours(minutes: number, quietStart: string | null, quietEnd: string | null): boolean {
  if (!quietStart || !quietEnd) return false;
  const start = parseTimeOfDay(quietStart);
  const end = parseTimeOfDay(quietEnd);
  if (start === null || end === null || start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export interface ReminderContext {
  now: Date;
  readToday: boolean;
  reminderSentToday: boolean;
  /** All notifications already sent to this user today, any kind. */
  sentToday: number;
}

export type SkipReason =
  | 'disabled'
  | 'already_read'
  | 'already_sent'
  | 'not_due'
  | 'quiet_hours'
  | 'daily_cap'
  | 'invalid_settings';

export type Decision = { send: true } | { send: false; reason: SkipReason };

export function decideReminder(settings: NotificationSettings, ctx: ReminderContext): Decision {
  if (!settings.remindersEnabled) return { send: false, reason: 'disabled' };
  const target = parseTimeOfDay(settings.reminderTime);
  if (target === null) return { send: false, reason: 'invalid_settings' };
  if (ctx.readToday) return { send: false, reason: 'already_read' };
  if (ctx.reminderSentToday) return { send: false, reason: 'already_sent' };

  const now = localMinutes(ctx.now, settings.timeZone);
  if (now < target || now >= target + REMINDER_WINDOW_MINUTES) return { send: false, reason: 'not_due' };
  if (inQuietHours(now, settings.quietStart, settings.quietEnd)) return { send: false, reason: 'quiet_hours' };
  if (ctx.sentToday >= settings.dailyCap) return { send: false, reason: 'daily_cap' };
  return { send: true };
}

export type SocialKind = keyof NotificationSettings['social'];

export function decideSocial(
  settings: NotificationSettings,
  kind: SocialKind,
  ctx: { now: Date; sentToday: number },
): Decision {
  if (!settings.social[kind]) return { send: false, reason: 'disabled' };
  const now = localMinutes(ctx.now, settings.timeZone);
  if (inQuietHours(now, settings.quietStart, settings.quietEnd)) return { send: false, reason: 'quiet_hours' };
  if (ctx.sentToday >= settings.dailyCap) return { send: false, reason: 'daily_cap' };
  return { send: true };
}
