/** Common UTF-8 mojibake in legacy library chapter titles (em dash, etc.). */
export function fixLibraryTextEncoding(text: string): string {
  return text
    .replace(/\u00e2\u20ac[\u0094\u0095\u201c\u201d"]/gi, '—')
    .replace(/â€[\u009d\u201c"]/g, '—')
    .replace(/â€"/g, '—')
    .replace(/â€“/g, '–')
    .replace(/Ã¢â‚¬â€œ/g, '—')
    .replace(/Ã¢â‚¬â€/g, '—')
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€\u009d/g, '"')
    .replace(/\u00a0/g, ' ');
}
