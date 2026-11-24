import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { badgeContext } from '@/lib/events/badge-design';
import { eventDateText } from '@/lib/events/certificates';
import BadgesClient from './BadgesClient';

export const metadata = { title: 'Badges' };

export const dynamic = 'force-dynamic';

export default async function BadgesPage(props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.view');
  if (access instanceof NextResponse) notFound();
  const ctx = await badgeContext(access.event.id);
  if (!ctx) notFound();
  return (
    <BadgesClient
      eventId={access.event.id}
      eventTitle={access.event.title}
      eventDate={eventDateText(access.event.startAt, access.event.endAt, access.event.timezone)}
      logoUrl={ctx.design.logoUrl}
      sponsorLogoUrls={ctx.design.sponsorLogoUrls}
      pro={ctx.pro}
      initial={ctx.settings}
      tiers={ctx.tiers}
      questions={ctx.questions}
      sponsorCount={ctx.sponsorCount}
      hasLogo={ctx.hasLogo}
    />
  );
}
