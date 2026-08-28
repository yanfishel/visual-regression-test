// Guards for page-level keyboard shortcuts (the comparison page's arrow keys
// and mode digits): a shortcut must never fire while the reader is typing
// (a search box, the jump list's filter) or holding a modifier (Alt+Left is
// the browser's own Back). Structural parameters rather than DOM types so
// the rules test without a document.

export function isEditableTarget(
  target: { tagName?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (!target) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function isPlainKey(event: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}
