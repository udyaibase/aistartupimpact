import type { CertificateTemplate } from './after-event';

/**
 * Colours and fonts of each certificate design, as plain numbers (0 to 1 per channel) so both the PDF
 * (certificate-pdf.ts) and the live preview in the host's form (CertificatePreview.tsx) draw from the same values.
 */
export type Triple = readonly [number, number, number];
export interface CertificateTheme {
  bg: Triple; ink: Triple; muted: Triple; accent: Triple;
  serif: boolean;
  /** Light text on a dark page. */
  dark?: boolean;
  /** Second colour for frames and seals. */
  accent2?: Triple;
}

export const CERTIFICATE_THEMES: Record<CertificateTemplate, CertificateTheme> = {
  classic: { bg: [0.992, 0.98, 0.957], ink: [0.1, 0.12, 0.2], muted: [0.38, 0.38, 0.42], accent: [0.69, 0.55, 0.24], serif: true },
  modern: { bg: [1, 1, 1], ink: [0.07, 0.09, 0.15], muted: [0.42, 0.45, 0.5], accent: [0.86, 0.15, 0.27], serif: false },
  minimal: { bg: [1, 1, 1], ink: [0.1, 0.1, 0.1], muted: [0.45, 0.45, 0.45], accent: [0.75, 0.75, 0.75], serif: false },
  // Navy page, gold frame and seal: for awards and flagship events.
  executive: { bg: [0.051, 0.094, 0.18], ink: [0.972, 0.953, 0.905], muted: [0.71, 0.74, 0.81], accent: [0.83, 0.69, 0.36], serif: true, dark: true },
  // Cream page, burgundy and gold triple border, ribbon seal: the look of a course or university certificate.
  heritage: { bg: [0.988, 0.976, 0.949], ink: [0.086, 0.153, 0.29], muted: [0.36, 0.38, 0.44], accent: [0.52, 0.11, 0.15], serif: true, accent2: [0.72, 0.58, 0.27] },
  // White page under a dark header band with a teal line: for workshops, hackathons and bootcamps.
  tech: { bg: [1, 1, 1], ink: [0.059, 0.09, 0.165], muted: [0.39, 0.45, 0.55], accent: [0.051, 0.58, 0.533], serif: false },
  // The host's own design: these are only used if that design can't be drawn and Classic is drawn instead.
  custom: { bg: [0.992, 0.98, 0.957], ink: [0.1, 0.12, 0.2], muted: [0.38, 0.38, 0.42], accent: [0.69, 0.55, 0.24], serif: true },
};

/** Page size (A4 landscape, in points) and the height of the Tech design's header band. */
export const CERTIFICATE_PAGE = { width: 842, height: 595, techBand: 168 } as const;
/** Host name colour inside the Tech design's dark band. */
export const TECH_BAND_HOST: Triple = [0.74, 0.79, 0.86];
