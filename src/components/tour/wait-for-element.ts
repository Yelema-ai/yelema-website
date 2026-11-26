/** The first element matching `selector` that has a box on screen (not `display: none`); null when none. */
export function visibleElement(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) if (el.getClientRects().length > 0) return el;
  return null;
}

/** The first visible element matching `selector`, as soon as it is in the page; null after `ms`. */
export function waitForElement(selector: string, ms: number): Promise<Element | null> {
  const found = visibleElement(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    const done = (el: Element | null) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(el);
    };
    const observer = new MutationObserver(() => {
      const el = visibleElement(selector);
      if (el) done(el);
    });
    const timer = setTimeout(() => done(null), ms);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  });
}
