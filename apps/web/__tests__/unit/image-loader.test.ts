import { describe, it, expect, vi, afterEach } from 'vitest';

const load = async (resizing: boolean) => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_CF_IMAGE_RESIZING', resizing ? 'true' : '');
  return (await import('@/lib/image-loader')).default;
};
afterEach(() => vi.unstubAllEnvs());

describe('Cloudflare image loader (Vercel optimisation never used)', () => {
  it('never produces a /_next/image URL', async () => {
    for (const resizing of [true, false]) {
      const loader = await load(resizing);
      for (const src of ['/logo-dark.svg', 'https://media.udyaibase.com/a/b.png', 'https://images.unsplash.com/photo-1?x=1', 'https://example.com/x.png']) {
        expect(loader({ src, width: 256 })).not.toContain('/_next/image');
      }
    }
  });

  it('our media: original from Cloudflare by default, resized by Cloudflare when enabled', async () => {
    expect((await load(false))({ src: 'https://media.udyaibase.com/logos/a.png', width: 128 })).toBe('https://media.udyaibase.com/logos/a.png#w=128');
    expect((await load(true))({ src: 'https://media.udyaibase.com/logos/a.png', width: 128, quality: 80 }))
      .toBe('https://media.udyaibase.com/cdn-cgi/image/width=128,quality=80,format=auto,fit=scale-down/logos/a.png');
  });

  it('moves the production bucket’s r2.dev URL onto the cached media domain', async () => {
    const loader = await load(false);
    expect(loader({ src: 'https://pub-5a271e4327a5417daf0699e16055d515.r2.dev/startups/x.png', width: 64 })).toBe('https://media.udyaibase.com/startups/x.png#w=64');
    // A different bucket isn't on the media domain; leave it alone.
    expect(loader({ src: 'https://pub-13cc9cc075664a129c48949c52d1908f.r2.dev/x.png', width: 64 })).toBe('https://pub-13cc9cc075664a129c48949c52d1908f.r2.dev/x.png#w=64');
  });

  it('Unsplash uses its own resizing; /public and other hosts are untouched', async () => {
    const loader = await load(false);
    const u = new URL(loader({ src: 'https://images.unsplash.com/photo-1?ixid=abc', width: 640, quality: 70 }));
    expect([u.searchParams.get('w'), u.searchParams.get('q'), u.searchParams.get('auto'), u.searchParams.get('ixid')]).toEqual(['640', '70', 'format', 'abc']);
    expect(loader({ src: '/founder-venkatesh.png', width: 640 })).toBe('/founder-venkatesh.png#w=640');
    expect(loader({ src: 'https://t3.gstatic.com/faviconV2?url=x', width: 64 })).toBe('https://t3.gstatic.com/faviconV2?url=x#w=64');
  });
});

describe('ready-made logo sizes', () => {
  it('marked logos use the smallest copy that covers the requested width', async () => {
    const loader = await load(true);
    const src = 'https://media.udyaibase.com/logos/acme%20ai.png?sz=1';
    expect(loader({ src, width: 48 })).toBe('https://media.udyaibase.com/sized/64/logos/acme%20ai.webp');
    expect(loader({ src, width: 96 })).toBe('https://media.udyaibase.com/sized/128/logos/acme%20ai.webp');
    expect(loader({ src, width: 256 })).toBe('https://media.udyaibase.com/sized/256/logos/acme%20ai.webp');
    expect(loader({ src, width: 640 })).toBe('https://media.udyaibase.com/logos/acme%20ai.png#w=640');
  });
  it('unmarked logos never point at copies that may not exist', async () => {
    expect((await load(false))({ src: 'https://media.udyaibase.com/logos/new.png', width: 64 })).toBe('https://media.udyaibase.com/logos/new.png#w=64');
  });
});
