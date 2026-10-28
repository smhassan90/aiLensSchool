/** Fix common UTF-8 mojibake in API text (e.g. em dash shown as â€"). */
export function fixDisplayText(text: string): string {
  return text
    .replace(/\u00e2\u20ac[\u0094\u0095\u201c\u201d"]/gi, "—")
    .replace(/â€[\u009d\u201c"]/g, "—")
    .replace(/â€"/g, "—")
    .replace(/â€“/g, "–")
    .replace(/Ã¢â‚¬â€œ/g, "—")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€\u009d/g, '"');
}
