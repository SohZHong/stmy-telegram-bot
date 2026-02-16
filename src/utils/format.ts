export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\n/g, " ").trim();
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  return chars.slice(0, max - 1).join("") + "…";
}
