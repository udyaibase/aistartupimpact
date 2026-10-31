/**
 * JSON for a <script type="application/ld+json"> tag. Plain JSON.stringify leaves `<` alone, so text such as a
 * job title containing `</script>` could close the tag and inject markup; escaping <, > and & prevents that.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
}
