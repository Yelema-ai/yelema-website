import { notFound } from "next/navigation";
import { PageBody } from "@/components/app/PageBody";
import { TeamView } from "@/components/team/TeamView";
import { loadCatalogue, matchCatalogue } from "@/lib/catalogue";
import { expertDisplayName } from "@/lib/experts";
import { currentInstance } from "@/lib/session";

// « Mon équipe » : les membres d'une instance d'équipe et les Experts ouverts à chacun. Rien ailleurs.
export default async function Page() {
  const [instance, catalogue] = await Promise.all([currentInstance().catch(() => null), loadCatalogue().catch(() => null)]);
  const team = instance?.team;
  if (!team) notFound();
  const expert = (key: string) => {
    const hit = catalogue ? matchCatalogue(catalogue.experts, key) : null;
    return { key, name: hit?.name ?? expertDisplayName(key), role: hit?.role ?? null, avatarUrl: hit?.avatarUrl ?? null };
  };
  return (
    <PageBody>
      <div className="max-w-5xl">
        <TeamView name={team.name} members={team.members.map((m) => ({ ...m, experts: m.experts.map(expert) }))} />
      </div>
    </PageBody>
  );
}
