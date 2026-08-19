export function getBoardAccessCookieName(boardId: string): string {
  return `board_access_${boardId}`;
}

export function parseCookiesHeader(header?: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  if (!header) return cookies;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;

    const name = part.slice(0, eq).trim();
    if (!name) continue;

    const raw = part.slice(eq + 1).trim();
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }

  return cookies;
}