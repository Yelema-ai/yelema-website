// What the proxy skips. Pure: tested. Instance traffic (its own token or signature, no session) and the tinted
// icons of e-mails (public) never pass it; a static file's suffix excuses a page's path, never one under /api.
const OUTSIDE = ["_next/static", "_next/image", "favicon.ico", "api/composio-mcp", "api/memory-mcp", "api/yele-mcp", "api/stt", "api/webhooks/meetstream", "api/meetings/icons/"];
export const PROXY_MATCHER = `/((?!${OUTSIDE.join("|")}|(?!api/).*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)`;
