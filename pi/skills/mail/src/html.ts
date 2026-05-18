// Strip HTML email bodies down to readable plain text. Not a perfect
// renderer; intent is "good enough for an agent or a human to grok the gist
// of the message". Keeps link URLs in [brackets] after their anchor text.

export function htmlToText(html: string): string {
  let s = html
  // Drop script/style/head wholesale.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "")
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "")
  s = s.replace(/<head[\s\S]*?<\/head>/gi, "")
  // Convert <br>, </p>, </div>, </li>, </tr>, </h\d> to newlines.
  s = s.replace(/<br\s*\/?>/gi, "\n")
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer)>/gi, "\n")
  s = s.replace(/<li[^>]*>/gi, "- ")
  s = s.replace(/<\/?(b|strong|i|em|span)[^>]*>/gi, "")
  // Anchors → "text [url]"
  s = s.replace(/<a\b[^>]*href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, "").trim()
    if (!cleanText) return `[${href}]`
    if (cleanText === href) return cleanText
    return `${cleanText} [${href}]`
  })
  // Strip all remaining tags.
  s = s.replace(/<[^>]+>/g, "")
  // Decode common HTML entities.
  s = decodeEntities(s)
  // Collapse whitespace.
  s = s.replace(/[ \t]+/g, " ")
  s = s.replace(/\n[ \t]+/g, "\n")
  s = s.replace(/\n{3,}/g, "\n\n")
  return s.trim()
}

export interface InlineRef {
  src: string // raw src attribute as it appeared in the HTML
  alt: string | null
}

export function extractImageRefs(html: string): InlineRef[] {
  const out: InlineRef[] = []
  const re = /<img\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const tag = m[0]
    const srcM = tag.match(/\bsrc=["']?([^"'\s>]+)["']?/i)
    const altM = tag.match(/\balt=["']([^"']*)["']/i)
    if (srcM) out.push({ src: srcM[1], alt: altM ? altM[1] : null })
  }
  return out
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&amp;/g, "&")
}
