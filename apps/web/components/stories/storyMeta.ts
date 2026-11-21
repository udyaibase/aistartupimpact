/** Who wrote a story, in words a reader understands: the founder themselves, or the Udyaibase team. */
export interface StoryLike {
  type?: string | null;
  founderWritten?: boolean | null;
  category?: { name?: string | null } | null;
  categoryName?: string | null;
}

export function isFounderWritten(s: StoryLike) {
  // Only when a founder account wrote it. Our team also posts stories of the founder-story type; those are editorial.
  if (s.type === 'STARTUP_UPDATE') return true;
  if (typeof s.founderWritten === 'boolean') return s.founderWritten;
  return s.type === 'FOUNDER_STORY';
}

/** The small label above a title: the topic, falling back to the kind of story. */
export function storyTopic(s: StoryLike) {
  return s.category?.name || s.categoryName || (isFounderWritten(s) ? 'Founder Journeys' : 'Editorial');
}

/** "Written by the founder" or "Udyaibase editorial". */
export function storySource(s: StoryLike) {
  return isFounderWritten(s) ? 'Written by the founder' : 'Udyaibase editorial';
}

export function formatStoryDate(d?: string | null, long = false) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', long
    ? { month: 'long', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function initials(name?: string | null) {
  if (!name) return 'U';
  // Words only: "Udyaibase Desk (demo)" → "UD", not "U(".
  const parts = name.replace(/\([^)]*\)/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || 'U';
}
