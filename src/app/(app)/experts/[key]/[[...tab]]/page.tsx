import { notFound } from "next/navigation";
import { getExpert } from "@/config/experts";
import { ExpertWorkspace, type ExpertTab } from "@/components/experts/ExpertWorkspace";

const TABS: Record<string, ExpertTab> = {
  livrables: "livrables",
  routines: "routines",
  fiche: "fiche",
};

// An expert's space: /experts/<key> (Discussion), /experts/<key>/livrables, /experts/<key>/routines,
// /experts/<key>/fiche.
export default async function ExpertPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; tab?: string[] }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { key, tab } = await params;
  const { q } = await searchParams;
  const expert = getExpert(key);
  if (!expert) notFound();

  const activeTabSegment = tab && tab.length > 0 ? tab[0] : null;
  if (tab && tab.length > 1) notFound();
  if (activeTabSegment && !TABS[activeTabSegment]) notFound();

  const activeTab = activeTabSegment ? TABS[activeTabSegment] : "discussion";
  return <ExpertWorkspace expertKey={expert.key} tab={activeTab} initialMessage={q ?? null} />;
}
