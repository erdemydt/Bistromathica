export function calculateReadingTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
