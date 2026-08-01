export async function readJsonResponse(response: Response, fallback: string): Promise<unknown> {
  const raw = await response.text();
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    const looksLikeHtml = contentType.includes('text/html') || /^\s*</.test(raw);
    if (looksLikeHtml) {
      throw new Error(`${fallback} (HTTP ${response.status}). The local API returned HTML while Next.js was compiling; retry in a moment.`);
    }
    throw new Error(`${fallback} (HTTP ${response.status}). The API returned an invalid JSON response.`);
  }
}
