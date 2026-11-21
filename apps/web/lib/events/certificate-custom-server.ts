import sanitizeHtml from 'sanitize-html';
import { MAX_CUSTOM_SVG } from './certificate-custom';

/**
 * Cleans a host's pasted SVG so it is only a picture: shapes, paths, gradients and text. Everything that could run,
 * load something from elsewhere or read a file is dropped. The result is safe to hand to the image library that
 * turns it into the certificate's page, and to show to other people.
 *
 * It is an allow-list: an element or attribute not named here does not survive, whatever it is.
 */

const TAGS = [
  'svg', 'g', 'defs', 'title', 'desc', 'symbol', 'use',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask',
  'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feComposite', 'feFlood', 'feMerge', 'feMergeNode', 'feDropShadow',
  'image', 'style',
];

const ATTRS = [
  'id', 'class', 'style', 'transform', 'opacity', 'display', 'visibility',
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy', 'width', 'height', 'd', 'points', 'rotate',
  'viewBox', 'preserveAspectRatio', 'xmlns', 'xmlns:xlink', 'version',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'letter-spacing', 'word-spacing', 'text-anchor', 'text-decoration', 'dominant-baseline', 'alignment-baseline', 'baseline-shift', 'textLength', 'lengthAdjust', 'startOffset',
  'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity', 'fx', 'fy',
  'patternUnits', 'patternTransform', 'patternContentUnits', 'clip-path', 'clip-rule', 'clipPathUnits', 'mask', 'maskUnits', 'maskContentUnits',
  'filter', 'filterUnits', 'stdDeviation', 'in', 'in2', 'result', 'mode', 'type', 'values', 'operator', 'flood-color', 'flood-opacity', 'k1', 'k2', 'k3', 'k4',
  'href', 'xlink:href',
];

/** A value that reaches outside the design: another site, a file, a script. `url(#id)` (a gradient or clip) is fine. */
const reachesOut = (value: string) =>
  /javascript:|vbscript:|data:(?!image\/(png|jpe?g);base64,)|file:|https?:|ftp:|\/\//i.test(value)
  || /url\(\s*["']?\s*(?!#)/i.test(value)
  || /expression\s*\(|@import|-moz-binding|behavior\s*:/i.test(value);

export function sanitizeCustomSvg(input: unknown): string {
  // Too large is refused whole: cutting a design short would draw half of it.
  const raw = typeof input === 'string' && input.length <= MAX_CUSTOM_SVG ? input.trim() : '';
  // Entity tricks (file reads, exponential expansion) need a DOCTYPE: a design never does.
  if (!raw || /<!DOCTYPE|<!ENTITY/i.test(raw)) return '';
  const start = raw.search(/<svg[\s>]/i);
  if (start < 0) return '';

  const clean = sanitizeHtml(raw.slice(start), {
    allowedTags: TAGS,
    allowedAttributes: { '*': ATTRS },
    // Keep SVG's own spelling (viewBox, linearGradient): the HTML default would lower-case and break them.
    parser: { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false },
    allowedSchemes: ['data'],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: [],
    allowVulnerableTags: true, // <style> is allowed on purpose; its content is checked below
    disallowedTagsMode: 'discard',
    // A link may only point inside the design (#id), or be a small embedded PNG or JPEG on an <image>.
    transformTags: {
      '*': (tagName, attribs) => {
        const out: Record<string, string> = {};
        for (const [name, value] of Object.entries(attribs)) {
          if (/^on/i.test(name)) continue;
          if (name === 'href' || name === 'xlink:href') {
            const v = value.trim();
            const inside = v.startsWith('#');
            const picture = tagName === 'image' && /^data:image\/(png|jpe?g);base64,[a-z0-9+/=\s]+$/i.test(v);
            if (inside || picture) out[name] = v;
            continue;
          }
          if (reachesOut(value)) continue;
          out[name] = value;
        }
        return { tagName, attribs: out };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'style' && reachesOut(frame.text || ''),
  });

  // Exactly one <svg>…</svg>, with the namespace the image library needs.
  const first = clean.search(/<svg[\s>]/);
  const last = clean.lastIndexOf('</svg>');
  if (first < 0 || last < 0) return '';
  let svg = clean.slice(first, last + 6);
  if (!/<svg[^>]*\sxmlns\s*=/.test(svg)) svg = svg.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg;
}
