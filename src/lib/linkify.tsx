/**
 * Linkify — turn raw text containing URLs into a React fragment with
 * the URLs wrapped in `<a>` elements.
 *
 * Used by the shopper chat threads (buyer + admin) so the Stripe
 * Checkout URL the backend posts as part of an invoice message
 * becomes a clickable link rather than copy-paste text.
 *
 * Why hand-roll instead of pulling in `linkify-react`?
 *   - One regex + one map is ~25 lines; the lib pulls a tokeniser.
 *   - We control the security posture (rel attrs, target, allowed
 *     schemes) explicitly.
 *
 * Security:
 *   - Only http:// and https:// schemes are matched. `javascript:` /
 *     `data:` / `mailto:` links from chat content are deliberately
 *     left as plain text; the URL has to start with `http`.
 *   - Anchors render with `rel="noopener noreferrer nofollow"` so the
 *     buyer's browser doesn't pass the thread URL to the destination
 *     and SEO juice doesn't transfer to admin-posted links.
 *   - The href value is the matched substring as-is — React escapes
 *     attribute values, so an attacker controlling the message body
 *     can't break out of the attribute.
 */

import type { JSX, ReactNode } from "react";

// Match http(s)://… until a whitespace, common closing punctuation, or
// a balanced/unbalanced closing bracket. Trailing `.,;:!?)` are stripped
// after the match because URLs at the end of a sentence usually pick
// those up by accident ("see https://x.com/foo, then…").
const URL_REGEX = /https?:\/\/[^\s<>"]+/gi;

const TRAILING_PUNCT = /[).,;:!?]+$/;

/**
 * Linkify a string. Returns a React fragment-friendly array — wrap in
 * a `<>...</>` (or assign to a variable inside JSX) at the call site.
 *
 * @param text   The message body to scan.
 * @param className Optional className applied to each anchor.
 */
export function linkify(text: string, className?: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // matchAll preserves match index; iterate over match objects directly.
  for (const match of text.matchAll(URL_REGEX)) {
    const fullMatch = match[0];
    const matchIndex = match.index ?? 0;

    // Trim trailing sentence punctuation off the matched URL and put
    // those characters back into the surrounding text. Without this,
    // "Pay at https://stripe.com/x." would treat the period as part of
    // the URL and 404 on click.
    const punct = fullMatch.match(TRAILING_PUNCT)?.[0] ?? "";
    const url = punct ? fullMatch.slice(0, fullMatch.length - punct.length) : fullMatch;

    // Push everything between the previous match and this one as plain text.
    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <Anchor key={`u${key++}`} href={url} className={className}>
        {url}
      </Anchor>,
    );

    if (punct) {
      nodes.push(punct);
    }
    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function Anchor({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      // noopener: prevent window.opener access from the destination.
      // noreferrer: don't leak the buyer's thread URL via Referer.
      // nofollow: no SEO value transferred for admin-posted links.
      rel="noopener noreferrer nofollow"
      className={className ?? "text-amber underline underline-offset-2 hover:text-amber-hi break-all"}
    >
      {children}
    </a>
  );
}
