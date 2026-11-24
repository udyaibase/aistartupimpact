'use client';

import NotificationBell from '@/components/NotificationBell';

/** Founder portal bell (listing reviews, edits, security notes, engagement nudges). */
export default function NotificationDropdown() {
  return <NotificationBell api="/api/founder/notifications" />;
}
