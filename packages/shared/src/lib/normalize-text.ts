export function normalizePostText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function dedupeKey(post: { text: string; hasSpinnableText: boolean }): string {
  return post.hasSpinnableText ? post.text : normalizePostText(post.text);
}
