export interface EmbedFont {
  id: string;
  label: string;
  stack: string;
  /** Google Fonts family query; absent for the system stack. */
  google?: string;
}

export const EMBED_FONTS: EmbedFont[] = [
  {
    id: "system",
    label: "System",
    stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  { id: "inter", label: "Inter", stack: '"Inter", ui-sans-serif, system-ui, sans-serif', google: "Inter:wght@400;500;600;700" },
  { id: "jakarta", label: "Plus Jakarta Sans", stack: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif', google: "Plus+Jakarta+Sans:wght@400;500;600;700" },
  { id: "poppins", label: "Poppins", stack: '"Poppins", ui-sans-serif, system-ui, sans-serif', google: "Poppins:wght@400;500;600;700" },
  { id: "dmsans", label: "DM Sans", stack: '"DM Sans", ui-sans-serif, system-ui, sans-serif', google: "DM+Sans:wght@400;500;600;700" },
  { id: "merriweather", label: "Merriweather", stack: '"Merriweather", Georgia, serif', google: "Merriweather:wght@400;700" },
  { id: "playfair", label: "Playfair Display", stack: '"Playfair Display", Georgia, serif', google: "Playfair+Display:wght@400;600;700" },
];

export function getEmbedFont(id: string | null | undefined): EmbedFont {
  return EMBED_FONTS.find((f) => f.id === id) ?? EMBED_FONTS[0];
}

export const TEXT_SCALES: Record<string, number> = { sm: 0.9375, md: 1, lg: 1.0625 };
