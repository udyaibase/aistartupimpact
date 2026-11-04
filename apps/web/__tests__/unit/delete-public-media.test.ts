import { describe, it, expect } from 'vitest';
import { mediaVariantKeys, ownMediaKey } from '@udyaibase/utils';

describe('ownMediaKey', () => {
  const base = 'https://media.udyaibase.com';

  it('reads the key of our own file', () => {
    expect(ownMediaKey(`${base}/avatar/u1/1-a.png`, base)).toBe('avatar/u1/1-a.png');
    expect(ownMediaKey(`${base}/avatar/a.png?v=2`, `${base}/`)).toBe('avatar/a.png');
  });

  it('never touches a file that isn’t ours', () => {
    expect(ownMediaKey('https://lh3.googleusercontent.com/a/photo', base)).toBeNull();
    expect(ownMediaKey('https://media.udyaibase.com.evil.test/a.png', base)).toBeNull();
    expect(ownMediaKey(null, base)).toBeNull();
    expect(ownMediaKey(`${base}/a.png`, undefined)).toBeNull();
  });

  it('rejects a path that tries to climb out', () => {
    expect(ownMediaKey(`${base}/../secret.png`, base)).toBeNull();
    expect(ownMediaKey(`${base}/%2e%2e/secret.png`, base)).toBeNull();
  });

  it('covers a file’s resized copies', () => {
    expect(mediaVariantKeys('logos/a.png')).toEqual(['logos/a.png', 'sized/64/logos/a.webp', 'sized/128/logos/a.webp', 'sized/256/logos/a.webp']);
  });
});
