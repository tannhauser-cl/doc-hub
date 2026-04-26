/**
 * drive-urls.ts — Shared helpers for Google Drive URL manipulation.
 *
 * Used by doc-hub skills whenever a user provides a Drive URL or file ID
 * and the skill needs to normalize it to a raw file ID for MCP tool calls.
 */

/**
 * Regex patterns for extracting file IDs from various Google Drive URL formats.
 *
 * Supported formats:
 *   https://drive.google.com/file/d/{fileId}/view
 *   https://drive.google.com/file/d/{fileId}/edit
 *   https://drive.google.com/open?id={fileId}
 *   https://docs.google.com/document/d/{fileId}/edit
 *   https://docs.google.com/spreadsheets/d/{fileId}/edit
 *   https://docs.google.com/presentation/d/{fileId}/edit
 *   https://drive.google.com/drive/folders/{fileId}
 *   Raw file ID (33-44 char alphanumeric string with hyphens/underscores)
 */
const DRIVE_URL_PATTERNS: RegExp[] = [
  // /file/d/{id}/
  /\/file\/d\/([a-zA-Z0-9_-]{25,})/,
  // /document/d/{id}/  or  /spreadsheets/d/{id}/  or  /presentation/d/{id}/
  /\/(?:document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]{25,})/,
  // /folders/{id}
  /\/folders\/([a-zA-Z0-9_-]{25,})/,
  // ?id={id}  or  &id={id}
  /[?&]id=([a-zA-Z0-9_-]{25,})/,
];

/**
 * Pattern for a raw file ID (no URL context).
 * Google Drive file IDs are 25–44 characters, alphanumeric + hyphen + underscore.
 */
const RAW_ID_PATTERN = /^[a-zA-Z0-9_-]{25,44}$/;

/**
 * Extract a Google Drive file ID from a URL or return the input as-is
 * if it is already a raw file ID.
 *
 * @param urlOrId - A Google Drive URL or a raw file ID string.
 * @returns The extracted file ID.
 * @throws Error if no valid file ID can be extracted.
 *
 * @example
 * extractFileId("https://docs.google.com/document/d/1abc123.../edit")
 * // → "1abc123..."
 *
 * extractFileId("1abc123...")
 * // → "1abc123..." (returned as-is)
 */
export function extractFileId(urlOrId: string): string {
  const input = urlOrId.trim();

  // Already a raw ID
  if (RAW_ID_PATTERN.test(input)) {
    return input;
  }

  // Try each URL pattern
  for (const pattern of DRIVE_URL_PATTERNS) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  throw new Error(
    `Could not extract a Google Drive file ID from: "${urlOrId}". ` +
    `Provide a valid Drive/Docs URL or a raw file ID (25–44 alphanumeric characters).`
  );
}

/**
 * Build a standard Google Drive view URL for a given file ID.
 *
 * @param fileId - A raw Google Drive file ID.
 * @returns The canonical Drive URL for the file.
 *
 * @example
 * docUrl("1abc123...")
 * // → "https://drive.google.com/file/d/1abc123.../view"
 */
export function docUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Build a Google Docs edit URL for a given file ID.
 * Prefer this over docUrl() when you know the file is a Google Doc.
 *
 * @param fileId - A raw Google Drive file ID.
 * @returns The Google Docs edit URL.
 */
export function docsEditUrl(fileId: string): string {
  return `https://docs.google.com/document/d/${fileId}/edit`;
}

/**
 * Build a Google Slides edit URL for a given file ID.
 *
 * @param fileId - A raw Google Drive file ID.
 * @returns The Google Slides edit URL.
 */
export function slidesEditUrl(fileId: string): string {
  return `https://docs.google.com/presentation/d/${fileId}/edit`;
}

/**
 * Build a Google Sheets edit URL for a given file ID.
 *
 * @param fileId - A raw Google Drive file ID.
 * @returns The Google Sheets edit URL.
 */
export function sheetsEditUrl(fileId: string): string {
  return `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
}
