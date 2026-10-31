'use client';

import { useEffect } from 'react';
import { trackInteraction } from '@/lib/track';

export default function TrackView({
  entityType,
  entityId,
  categoryId,
}: {
  entityType: string;
  entityId: string;
  categoryId?: string;
}) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source') || undefined;
    const utmMedium = params.get('utm_medium') || undefined;
    const utmCampaign = params.get('utm_campaign') || undefined;
    const referrer = document.referrer || undefined;

    const metadata = {
      ...(utmSource && { utm_source: utmSource }),
      ...(utmMedium && { utm_medium: utmMedium }),
      ...(utmCampaign && { utm_campaign: utmCampaign }),
      ...(referrer && { referrer }),
    };

    // Track in user interactions (requires auth, may silently fail)
    trackInteraction({ action: 'view', entityType, entityId, categoryId, metadata });

    // Track in AnalyticsDaily (no auth required, captures UTM data)
    const trackEntityType = entityType.toUpperCase();
    if (['JOB', 'EVENT', 'TOOL', 'STARTUP', 'ARTICLE'].includes(trackEntityType)) {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: trackEntityType,
          entityId,
          eventType: 'VIEW',
          utmSource,
          utmMedium,
          utmCampaign,
          referrer,
        }),
        keepalive: true,
      }).catch(() => {});
    }
  }, [entityType, entityId, categoryId]);

  return null;
}
