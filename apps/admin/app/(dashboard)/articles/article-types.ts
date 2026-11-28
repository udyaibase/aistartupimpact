/** Every article type the database knows, with the name staff see. Shared by the list and the editor. */
export const TYPE_LABEL: Record<string, string> = {
  NEWS: 'News', STORY: 'Story', OPINION: 'Opinion', GUIDE: 'Guide', COMPARISON: 'Comparison', REPORT: 'Report',
  TOOL_REVIEW: 'Tool review', SPONSORED: 'Sponsored', FOUNDER_STORY: 'Founder story', STARTUP_UPDATE: 'Startup update',
};

/** Where each type appears on the website, shown under the Type menu so the choice is not a guess. */
export const TYPE_PLACE: Record<string, string> = {
  NEWS: 'News section', GUIDE: 'News section', COMPARISON: 'News section', REPORT: 'News section', TOOL_REVIEW: 'News section',
  SPONSORED: 'Opens by link with a Sponsored label; not in the News listing',
  STORY: 'Stories section', FOUNDER_STORY: 'Stories section', STARTUP_UPDATE: 'Stories section', OPINION: 'Opinions section',
};
