import { notFound } from "next/navigation";
import { getExpert } from "@/config/experts";
import { ExpertWorkspace, type ExpertTab } from "@/components/experts/ExpertWorkspace";

const TABS: Record<string, ExpertTab> = { livrables: "livrables", fiche: "fiche" };

// An expert's space: /experts/<key> (Discussion), /experts/<key>/livrables, /experts/<key>/fiche.
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
  if (!expert || (tab && (tab.length > 1 || !TABS[tab[0]]))) notFound();
  return <ExpertWorkspace expertKey={expert.key} tab={tab ? TABS[tab[0]] : "discussion"} initialMessage={q ?? null} />;
}
