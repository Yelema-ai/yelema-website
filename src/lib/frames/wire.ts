import { isTrustedDashboardUrl } from "../dashboards.ts";

export interface PublishedFrame {
  id: string;
  url: string;
}

const FRAME_ID = /^frm_[A-Za-z0-9_-]{1,64}$/;

export const isFrameId = (value: unknown): value is string => typeof value === "string" && FRAME_ID.test(value);

export const isFrameUrl = (value: unknown): value is string => isTrustedDashboardUrl(value) && value === value.trim();

export function publishedFrame(id: unknown, url: unknown): PublishedFrame | null {
  return isFrameId(id) && isFrameUrl(url) ? { id, url } : null;
}
