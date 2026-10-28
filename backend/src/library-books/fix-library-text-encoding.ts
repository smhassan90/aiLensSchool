/** Common UTF-8 mojibake in legacy library chapter titles (em dash, etc.). */
export function fixLibraryTextEncoding(text: string): string {
  return text
    .replace(/â€[\u009d\u201c"]/g, '—')
    .replace(/â€"/g, '—')
    .replace(/â€“/g, '–')
    .replace(/Ã¢â‚¬â€œ/g, '—')
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€\u009d/g, '"')
    .replace(/\u00a0/g, ' ');
}
