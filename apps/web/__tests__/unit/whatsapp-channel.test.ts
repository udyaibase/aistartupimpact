import { describe, it, expect } from 'vitest';
import { channelHref, isWhatsappChannelUrl } from '@/lib/whatsapp-channel';

describe('WhatsApp jobs channel link', () => {
  it('accepts only a real channel invite link', () => {
    expect(isWhatsappChannelUrl('https://whatsapp.com/channel/0029VaAbCdEfGhIjKlMnOp12')).toBe(true);
    expect(isWhatsappChannelUrl('https://www.whatsapp.com/channel/0029VaAbCdEfGhIjKlMnOp12/')).toBe(true);
    expect(isWhatsappChannelUrl('http://whatsapp.com/channel/0029VaAbCdEfGhIjKlMnOp12')).toBe(false); // not https
    expect(isWhatsappChannelUrl('https://chat.whatsapp.com/AbCdEfGhIjKl')).toBe(false); // a group, not a channel
    expect(isWhatsappChannelUrl('https://wa.me/919845012345')).toBe(false); // a person
    expect(isWhatsappChannelUrl('https://whatsapp.com.evil.io/channel/0029VaAbCdEfGhIjKlMnOp12')).toBe(false);
    expect(isWhatsappChannelUrl('https://whatsapp.com/channel/short')).toBe(false);
    expect(isWhatsappChannelUrl('')).toBe(false);
    expect(isWhatsappChannelUrl(null)).toBe(false);
  });
  it('links go through the counted redirect, by surface', () => {
    expect(channelHref('apply')).toBe('/go/whatsapp-jobs?from=apply');
    expect(channelHref('track')).toBe('/go/whatsapp-jobs?from=track');
  });
});
