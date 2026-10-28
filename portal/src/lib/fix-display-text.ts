/** Fix common UTF-8 mojibake in API text (e.g. em dash shown as â€"). */
export function fixDisplayText(text: string): string {
  return text
    .replace(/â€"/g, "—")
    .replace(/â€“/g, "–")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€\u009d/g, '"');
}
