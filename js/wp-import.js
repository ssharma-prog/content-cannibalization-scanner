// WordPress XML export parser

function parseWordPressExport(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const items = doc.querySelectorAll('item');
  const posts = [];

  for (const item of items) {
    // Only include posts (not pages, attachments, etc.)
    const postType = item.querySelector('post_type')?.textContent?.trim();
    if (postType && postType !== 'post') continue;

    const status = item.querySelector('status')?.textContent?.trim();
    if (status && status !== 'publish') continue;

    const title = item.querySelector('title')?.textContent?.trim() || '';
    const link = item.querySelector('link')?.textContent?.trim() || '';
    const contentEncoded = item.getElementsByTagNameNS('*', 'encoded');

    let text = '';
    for (const el of contentEncoded) {
      // content:encoded is usually the first one, excerpt:encoded is the second
      if (el.textContent.length > text.length) {
        text = el.textContent;
      }
    }

    // Strip HTML tags from content
    text = stripHtml(text);

    if (title && text.length > 50) {
      posts.push({ url: link || `#${title}`, title, text });
    }
  }

  return posts;
}

function stripHtml(html) {
  // Remove HTML tags, shortcodes, and clean up whitespace
  return html
    .replace(/\[\/?\w+[^\]]*\]/g, ' ')   // WordPress shortcodes [shortcode]
    .replace(/<[^>]+>/g, ' ')              // HTML tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export { parseWordPressExport };
