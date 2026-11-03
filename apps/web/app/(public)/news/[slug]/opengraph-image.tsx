import { ImageResponse } from 'next/og';
import { getArticleBySlugDirect } from '@/lib/db';

export const runtime = 'edge';
export const alt = 'Article preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage({ params }: { params: { slug: string } }) {
  const article = await getArticleBySlugDirect(params.slug);

  // A social image the editor picked in the admin wins over the generated card.
  if (article?.ogImage) {
    const res = await fetch(article.ogImage).catch(() => null);
    const type = res?.ok ? res.headers.get('content-type') : null;
    if (res && type?.startsWith('image/')) return new Response(res.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=3600' } });
  }

  const title = article?.title || 'Udyaibase';
  const category = article?.category?.name || 'News';
  const author = article?.author?.name || 'Udyaibase Editorial';
  const coverImage = article?.coverImage;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: '#0D1B2A',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background cover image with overlay */}
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
              opacity: 0.25,
            }}
          />
        )}

        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, rgba(13,27,42,0.95) 0%, rgba(13,27,42,0.7) 100%)',
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
          {/* Top: site name + category */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.5px',
              }}
            >
              ASI
            </span>
            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.3)' }} />
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#E63946',
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
              }}
            >
              {category}
            </span>
          </div>

          {/* Middle: title */}
          <div
            style={{
              fontSize: title.length > 80 ? '38px' : '48px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.2,
              maxWidth: '900px',
            }}
          >
            {title}
          </div>

          {/* Bottom: author + branding */}
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
            <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
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
