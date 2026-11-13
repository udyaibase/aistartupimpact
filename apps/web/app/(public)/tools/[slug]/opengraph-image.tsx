/**
 * Dynamic OG Image Generator for AI Tools
 * Issue #5 Fixed: Dynamic generation (not optional static fallback)
 * Generates unique 1200x630 images for each tool
 */

import { ImageResponse } from 'next/og';
import { sql } from '@/lib/db';

export const runtime = 'edge';
export const alt = 'AI Tool Profile';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  try {
    const tool = await sql`
      SELECT name, tagline, "logoUrl", "pricingModel", "avgRating", "categoryName"
      FROM "AiTool"
      WHERE slug = ${params.slug} AND status = 'APPROVED' AND "deletedAt" IS NULL
      LIMIT 1
    `;

    if (!tool.length) {
      // Fallback for not found
      return new ImageResponse(
        (
          <div
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'system-ui',
            }}
          >
            <div style={{ fontSize: 48, color: 'white' }}>Tool Not Found</div>
          </div>
        ),
        { ...size }
      );
    }

    const t = tool[0];

    const pricingLabels: Record<string, string> = {
      FREE: 'Free',
      FREEMIUM: 'Freemium',
      PAID: 'Paid',
      OPEN_SOURCE: 'Open Source',
      ENTERPRISE: 'Enterprise',
      SUBSCRIPTION: 'Subscription',
    };

    return new ImageResponse(
      (
        <div
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px',
            fontFamily: 'system-ui',
            position: 'relative',
          }}
        >
          {/* Logo if available */}
          {t.logoUrl && (
            <img
              src={t.logoUrl}
              alt={t.name}
              width={120}
              height={120}
              style={{ 
                borderRadius: '24px', 
                marginBottom: '32px',
                objectFit: 'contain',
                background: 'white',
                padding: '12px'
              }}
            />
          )}
          
          {/* Tool Name */}
          <div style={{ 
            fontSize: 72, 
            fontWeight: 'bold', 
            color: 'white', 
            textAlign: 'center',
            marginBottom: '24px',
            maxWidth: '900px',
            lineHeight: 1.2
          }}>
            {t.name}
          </div>
          
          {/* Tagline */}
          {t.tagline && (
            <div style={{ 
              fontSize: 36, 
              color: 'rgba(255,255,255,0.9)', 
              textAlign: 'center',
              marginBottom: '32px',
              maxWidth: '800px',
              lineHeight: 1.4
            }}>
              {t.tagline}
            </div>
          )}
          
          {/* Metadata badges */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {t.categoryName && (
              <div style={{ 
                fontSize: 24, 
                color: 'rgba(255,255,255,0.8)', 
                background: 'rgba(255,255,255,0.2)', 
                padding: '12px 24px', 
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {t.categoryName}
              </div>
            )}
            {t.pricingModel && (
              <div style={{ 
                fontSize: 24, 
                color: 'rgba(255,255,255,0.8)', 
                background: 'rgba(255,255,255,0.2)', 
                padding: '12px 24px', 
                borderRadius: '12px' 
              }}>
                {pricingLabels[t.pricingModel] || t.pricingModel}
              </div>
            )}
            {t.avgRating && t.avgRating > 0 && (
              <div style={{ 
                fontSize: 24, 
                color: 'rgba(255,255,255,0.8)', 
                background: 'rgba(255,255,255,0.2)', 
                padding: '12px 24px', 
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#facc15"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                {t.avgRating}
              </div>
            )}
          </div>
          
          {/* Branding footer */}
          <div style={{
            position: 'absolute',
            bottom: '40px',
            fontSize: 20,
            color: 'rgba(255,255,255,0.7)',
            fontWeight: 600
          }}>
            udyaibase.com
          </div>
        </div>
      ),
      { ...size }
    );
  } catch (error) {
    console.error('Error generating OG image:', error);
    // Fallback error image
    return new ImageResponse(
      (
        <div
          style={{
            background: '#10b981',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 48, color: 'white' }}>Udyaibase</div>
        </div>
      ),
      { ...size }
    );
  }
}
