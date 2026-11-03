import { ImageResponse } from 'next/og';
import { getArticleBySlugDirect } from '@/lib/db';

export const runtime = 'edge';
export const alt = 'Founder story preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage({ params }: { params: { slug: string } }) {
  const story = await getArticleBySlugDirect(params.slug);

  // A social image the editor picked in the admin wins over the generated card.
  if (story?.ogImage) {
    const res = await fetch(story.ogImage).catch(() => null);
    const type = res?.ok ? res.headers.get('content-type') : null;
    if (res && type?.startsWith('image/')) return new Response(res.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=3600' } });
  }

  const title = story?.title || 'Founder Story';
  const excerpt = story?.excerpt || '';
  const author = story?.author?.name || 'Udyaibase Editorial';
  const coverImage = story?.coverImage;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: '#0D1B2A',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background cover image */}
        {coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.2,
            }}
          />
        )}

        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, rgba(13,27,42,0.97) 0%, rgba(13,27,42,0.75) 100%)',
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%',
            padding: '60px 72px',
          }}
        >
          {/* Top */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff' }}>ASI</span>
            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.3)' }} />
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#E63946',
                textTransform: 'uppercase',
                letterSpacing: '2px',
              }}
            >
              Founder Story
            </span>
          </div>

          {/* Title + excerpt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '900px' }}>
            <div
              style={{
                fontSize: title.length > 80 ? '36px' : '46px',
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.2,
              }}
            >
              {title}
            </div>
            {excerpt && (
              <div
                style={{
                  fontSize: '20px',
                  color: 'rgba(255,255,255,0.6)',
                  lineHeight: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {excerpt}
              </div>
            )}
          </div>

          {/* Bottom */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(230,57,70,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#E63946',
                }}
              >
                {author.charAt(0)}
              </div>
              <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                {author}
              </span>
            </div>
            <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)' }}>
              udyaibase.com
            </span>
          </div>
        </div>

        {/* Red accent bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '6px',
            background: '#E63946',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
