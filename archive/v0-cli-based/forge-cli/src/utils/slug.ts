export function generateSlug(input: string, existingSlugs: string[] = []): string {
  const hasNonLatin = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(input);

  if (hasNonLatin) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    let slug = `feature-${Math.abs(hash).toString(36)}`;
    return ensureUnique(slug, existingSlugs);
  }

  let slug = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug.length > 50) {
    slug = slug.substring(0, 50).replace(/-[^-]*$/, '');
  }

  if (!slug) {
    slug = `feature-${Date.now().toString(36)}`;
  }

  return ensureUnique(slug, existingSlugs);
}

function ensureUnique(slug: string, existingSlugs: string[]): string {
  if (!existingSlugs.includes(slug)) return slug;

  let counter = 2;
  while (existingSlugs.includes(`${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}
