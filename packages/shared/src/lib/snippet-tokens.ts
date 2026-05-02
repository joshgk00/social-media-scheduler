export const SNIPPET_TOKEN_RE = /\{\{snippet:([a-zA-Z0-9_\- ]+)\}\}/g;
export const MAX_SNIPPET_INPUT_LENGTH = 50_000;

export interface SnippetSubstitutionResult {
  result: string;
  missing: string[];
}

export function substituteSnippetsInText(
  text: string,
  resolve: (lowercaseName: string) => string | undefined,
): SnippetSubstitutionResult {
  if (text.length > MAX_SNIPPET_INPUT_LENGTH) {
    return { result: text, missing: [] };
  }

  const missing: string[] = [];
  const result = text.replace(
    SNIPPET_TOKEN_RE,
    (match: string, rawName: string): string => {
      const name = rawName.trim().toLowerCase();
      const body = resolve(name);

      if (body === undefined) {
        missing.push(name);
        return match;
      }

      return body;
    },
  );

  return { result, missing };
}
