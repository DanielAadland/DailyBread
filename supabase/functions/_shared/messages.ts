// Notification text sent from the server. Mirrors the `notifications.*` keys in
// packages/i18n/src/en.json; add a locale here when the app gets one.
// Tone: an invitation, never pressure or guilt.

export const REMINDER_MESSAGES: Record<string, Array<{ title: string; body: string }>> = {
  en: [
    { title: 'Your daily reading', body: 'A few quiet minutes with today’s passage?' },
    { title: 'Time to read', body: 'Today’s reading is ready when you are.' },
    { title: 'Your daily reading', body: 'Take a moment for today’s chapter.' },
  ],
};

export function reminderMessage(locale: string, seed: number): { title: string; body: string } {
  const list = REMINDER_MESSAGES[locale] ?? REMINDER_MESSAGES.en!;
  return list[Math.abs(seed) % list.length]!;
}

/** Social notifications. `{name}` is the person who acted. */
export const SOCIAL_MESSAGES: Record<string, Record<string, string>> = {
  en: {
    comment: '{name} commented on your post',
    reaction: '{name} reacted to your post',
    follow: '{name} started following you',
    follow_request: '{name} would like to follow you',
    follow_accepted: '{name} accepted your follow request',
  },
};

export function socialMessage(locale: string, kind: string, name: string): { title: string; body: string } {
  const list = SOCIAL_MESSAGES[locale] ?? SOCIAL_MESSAGES.en!;
  return { title: 'DailyBread', body: (list[kind] ?? list.comment!).replace('{name}', name) };
}
