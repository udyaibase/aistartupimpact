// Same card for X/Twitter as for every other share preview of /india-ai. Route config must be literal here
// (Next reads it statically), so it is repeated rather than re-exported.
export const runtime = 'edge';
export const alt = 'India AI Ecosystem - Live Map & Data';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export { default } from './opengraph-image';
