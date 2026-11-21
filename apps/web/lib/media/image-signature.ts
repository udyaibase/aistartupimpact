/**
 * Checks that an uploaded file really is the kind of image it claims to be, from its first bytes. The type a browser
 * sends with an upload is just a label anyone can set; without this, any file could be stored and served as an image.
 */
export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function looksLikeImage(bytes: Uint8Array, mime: string): boolean {
  const b = bytes;
  const ascii = (from: number, text: string) => text.split('').every((ch, i) => b[from + i] === ch.charCodeAt(0));
  switch (mime) {
    case 'image/jpeg': return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png': return b.length > 8 && b[0] === 0x89 && ascii(1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
    case 'image/gif': return b.length > 6 && (ascii(0, 'GIF87a') || ascii(0, 'GIF89a'));
    case 'image/webp': return b.length > 12 && ascii(0, 'RIFF') && ascii(8, 'WEBP');
    default: return false;
  }
}
