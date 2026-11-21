import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eventPriceLabel } from '@/lib/events/price-label';

const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('what a ticket costs, in words', () => {
  it('no tickets set up, or only free ones, is Free', () => {
    expect(eventPriceLabel([])).toEqual({ free: true, label: 'Free' });
    expect(eventPriceLabel([0, 0])).toEqual({ free: true, label: 'Free' });
    expect(eventPriceLabel([null, undefined])).toEqual({ free: true, label: 'Free' });
  });
  it('paid events are never called Free', () => {
    expect(eventPriceLabel([49900])).toEqual({ free: false, label: '₹499' });
    expect(eventPriceLabel([49900, 149900])).toEqual({ free: false, label: 'From ₹499' });
    expect(eventPriceLabel([49900, 49900]).label).toBe('₹499');
    expect(eventPriceLabel([0, 29900])).toEqual({ free: false, label: 'Free or from ₹299' });
    expect(eventPriceLabel([150000]).label).toBe('₹1,500');
  });
});

describe('public event page', () => {
  const page = src('app/(public)/events/[slug]/EventDetailClient.tsx');

  it('shows the real price, not a fixed "Free"', () => {
    expect(page).not.toContain('>Free</span>');
    expect(page).not.toMatch(/>\s*Register Now — Free\s*</);
    expect(src('components/events/EventListClient.tsx')).toContain('eventPriceLabel([event.minPricePaise, event.maxPricePaise])');
  });

  it('phones get a Register bar that sits above the bottom menu and the cookie banner', () => {
    expect(page).toContain('data-sticky-register');
    expect(page).toContain('var(--cookie-banner-space, 0px)');
    expect(page).toMatch(/data-sticky-register\s+className="md:hidden fixed/);
    expect(src('components/CookieConsent.tsx')).toContain("setProperty('--cookie-banner-space'");
    expect(src('components/CookieConsent.tsx')).toContain("removeProperty('--cookie-banner-space')");
  });

  it('an event without a cover image gets a slim band, not a square box', () => {
    expect(page).toContain('event.coverImageUrl ? "aspect-square" : "h-16 md:h-28"');
  });

  it('the cookie banner is a bar on the bottom edge on wide screens, not a card in the corner', () => {
    const css = src('styles/CookieConsent.module.css');
    const wide = css.slice(css.indexOf('@media (min-width: 1024px) {'), css.indexOf('@media (max-width: 1023px)'));
    expect(wide).toMatch(/left: 0;\s+right: 0;\s+bottom: 0;/);
  });
});
