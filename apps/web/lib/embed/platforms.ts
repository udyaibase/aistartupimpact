export type PlatformId =
  | "html"
  | "react"
  | "wordpress"
  | "webflow"
  | "framer"
  | "wix"
  | "squarespace"
  | "notion"
  | "google-sites";

export interface Platform {
  id: PlatformId;
  label: string;
  mode: "code" | "link";
  steps: string[];
  note?: string;
}

export const PLATFORMS: Platform[] = [
  {
    id: "html",
    label: "HTML",
    mode: "code",
    steps: [
      "Open the page file where you want your events to appear.",
      "Paste the code where the events should show, inside <body>.",
      "Save and publish the page.",
    ],
  },
  {
    id: "react",
    label: "React / Next.js / Vue",
    mode: "code",
    steps: [
      "Add the <script> line once, in your root layout or index.html. In Next.js, use <Script src=\"…\" strategy=\"afterInteractive\" /> from next/script.",
      "Put the <div> line in any page or component where events should show. In React, write it as JSX exactly as is.",
      "Deploy. Widgets mount on route changes and unmount cleanly on their own, so there's no extra code.",
    ],
    note: "Rendering inside a shadow root? Call window.Udyaibase.mount(element) yourself. You can also use <udyaibase-widget widget-id=\"…\"></udyaibase-widget> instead of the div.",
  },
  {
    id: "wordpress",
    label: "WordPress",
    mode: "code",
    steps: [
      "Edit the page and click + to add a block.",
      "Choose the Custom HTML block and paste the code.",
      "Click Update to publish.",
    ],
    note: "On WordPress.com, Custom HTML needs the Business plan or higher.",
  },
  {
    id: "webflow",
    label: "Webflow",
    mode: "code",
    steps: [
      "In the Designer, open Add (A) and drag a Code Embed element onto the page.",
      "Paste the code and click Save & Close.",
      "Publish your site. Embeds don't run in the Designer canvas, only on the published site.",
    ],
  },
  {
    id: "framer",
    label: "Framer",
    mode: "code",
    steps: [
      "Press I to open Insert, search for Embed and drop it on the page.",
      "In the right panel set Type to HTML and paste the code.",
      "Set the embed height to Fit Content, then Publish.",
    ],
  },
  {
    id: "wix",
    label: "Wix",
    mode: "code",
    steps: [
      "Click Add Elements, then Embed Code, then Embed HTML.",
      "Choose Code, paste it and click Update.",
      "Drag the box to full width and enough height, then Publish.",
    ],
    note: "Wix places embeds in a fixed-size box, so give it room for your events.",
  },
  {
    id: "squarespace",
    label: "Squarespace",
    mode: "code",
    steps: [
      "Edit the page, click Add Block and choose Code.",
      "Paste the code and make sure Display Source is off.",
      "Click Save. Code blocks need a Business plan or higher.",
    ],
  },
  {
    id: "notion",
    label: "Notion",
    mode: "link",
    steps: [
      "Copy the link below.",
      "On your Notion page type /embed and press Enter.",
      "Paste the link, click Embed link, then drag the bottom edge to fit your events.",
    ],
  },
  {
    id: "google-sites",
    label: "Google Sites",
    mode: "link",
    steps: [
      "Copy the link below.",
      "In the editor click Insert, then Embed, and stay on the By URL tab.",
      "Paste the link, choose Whole page, click Insert and resize the box.",
    ],
  },
];

export function getPlatform(id: string | null | undefined): Platform | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com").replace(/\/$/, "");
}

export function buildSnippet(widgetId: string, origin = siteOrigin()): string {
  return `<div data-udyaibase-widget="${widgetId}"></div>\n<script src="${origin}/embed/loader.js" async></script>`;
}

export function buildDirectLink(widgetId: string, origin = siteOrigin()): string {
  return `${origin}/embed/${widgetId}`;
}
