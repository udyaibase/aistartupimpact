/**
 * Dynamic OG Image Generator for Startups
 * Issue #5 Fixed: Dynamic generation (not optional static fallback)
 * Generates unique 1200x630 images for each startup
 */

import { ImageResponse } from 'next/og';
import { sql } from '@/lib/db';

export const runtime = 'edge';
export const alt = 'AI Startup Profile';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  try {
    const startup = await sql`
      SELECT name, tagline, "logoUrl", "headquartersCity", stage, "foundedYear"
      FROM "Startup"
      WHERE slug = ${params.slug} AND "deletedAt" IS NULL
      LIMIT 1
    `;

    if (!startup.length) {
      // Fallback for not found
      return new ImageResponse(
        (
          <div
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'system-ui',
            }}
          >
            <div style={{ fontSize: 48, color: 'white' }}>Startup Not Found</div>
          </div>
        ),
        { ...size }
      );
    }

    const s = startup[0];

    return new ImageResponse(
      (
        <div
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
          {s.logoUrl && (
            <img
              src={s.logoUrl}
              alt={s.name}
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
          
          {/* Startup Name */}
          <div style={{ 
            fontSize: 72, 
            fontWeight: 'bold', 
            color: 'white', 
            textAlign: 'center',
            marginBottom: '24px',
            maxWidth: '900px',
            lineHeight: 1.2
          }}>
            {s.name}
          </div>
          
          {/* Tagline */}
          {s.tagline && (
            <div style={{ 
              fontSize: 36, 
              color: 'rgba(255,255,255,0.9)', 
              textAlign: 'center',
              marginBottom: '32px',
              maxWidth: '800px',
              lineHeight: 1.4
            }}>
              {s.tagline}
            </div>
          )}
          
          {/* Metadata badges */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {s.headquartersCity && (
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
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg>
                {s.headquartersCity}
              </div>
            )}
            {s.stage && (
              <div style={{ 
                fontSize: 24, 
                color: 'rgba(255,255,255,0.8)', 
                background: 'rgba(255,255,255,0.2)', 
                padding: '12px 24px', 
                borderRadius: '12px' 
              }}>
                {s.stage.replace(/_/g, ' ')}
              </div>
            )}
            {s.foundedYear && (
              <div style={{ 
                fontSize: 24, 
                color: 'rgba(255,255,255,0.8)', 
                background: 'rgba(255,255,255,0.2)', 
                padding: '12px 24px', 
                borderRadius: '12px' 
              }}>
                Founded {s.foundedYear}
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
            background: '#667eea',
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
