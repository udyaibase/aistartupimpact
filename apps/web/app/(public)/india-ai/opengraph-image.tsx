import { ImageResponse } from 'next/og';
import { sql } from '@/lib/db';
import { hqInIndia } from '@/lib/india-hq';

export const runtime = 'edge';
export const alt = 'India AI Ecosystem - Live Map & Data';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  const [startupCount, fundingResult] = await Promise.all([
    sql`SELECT COUNT(*)::int as count FROM "Startup" WHERE ${hqInIndia('"Startup"')} AND "deletedAt" IS NULL AND "isApproved" = true`,
    sql`SELECT COALESCE(SUM("amountInr"), 0)::bigint as total FROM "FundingRound" fr JOIN "Startup" s ON fr."startupId" = s.id WHERE ${hqInIndia('s')} AND s."deletedAt" IS NULL`,
  ]);

  const startups = startupCount[0]?.count || 0;
  const fundingPaise = Number(fundingResult[0]?.total || 0);
  const fundingCr = fundingPaise / 100 / 10000000;
  const fundingLabel = fundingCr >= 100000
    ? `₹${(fundingCr / 100000).toFixed(1)}L Cr`
    : `₹${Math.round(fundingCr).toLocaleString('en-IN')} Cr`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: 'linear-gradient(135deg, #0D1B2A 0%, #1B2D45 50%, #0D1B2A 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '40px',
            right: '60px',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,59,48,0.15) 0%, transparent 70%)',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '60px',
            width: '100%',
            height: '100%',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  background: '#FF3B30',
                  color: 'white',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  fontSize: '18px',
                  fontWeight: 700,
                }}
              >
                LIVE DATA
              </div>
            </div>

            <div
              style={{
                fontSize: '52px',
                fontWeight: 800,
                color: 'white',
                lineHeight: 1.15,
                marginBottom: '16px',
              }}
            >
              India AI Ecosystem
            </div>

            <div
              style={{
                fontSize: '28px',
                color: '#94A3B8',
                lineHeight: 1.4,
                maxWidth: '700px',
              }}
            >
              Real-time intelligence on startups, funding, IndiaAI Mission, policy & talent
            </div>
          </div>

          <div style={{ display: 'flex', gap: '40px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '48px', fontWeight: 800, color: '#FF3B30' }}>
                {startups.toLocaleString('en-IN')}+
              </div>
              <div style={{ fontSize: '18px', color: '#94A3B8' }}>AI Startups</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '48px', fontWeight: 800, color: '#FF3B30' }}>
                {fundingLabel}
              </div>
              <div style={{ fontSize: '18px', color: '#94A3B8' }}>Funding Tracked</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '48px', fontWeight: 800, color: '#FF3B30' }}>
                ₹10,372 Cr
              </div>
              <div style={{ fontSize: '18px', color: '#94A3B8' }}>IndiaAI Mission</div>
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: '30px',
              right: '60px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <div style={{ fontSize: '20px', color: '#64748B' }}>udyaibase.com/india-ai</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
