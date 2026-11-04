import { requireUser } from "@/lib/auth";
import { handleError, noStore } from "@/lib/http";
import { getVideoTaskStatus } from "@/lib/moneyprinter";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 30;

/**
 * GET /api/videos/tasks/{id}
 * Récupère le statut et la progression d'une tâche de génération vidéo.
 */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    await requireUser();
    const { id } = await params;
    const status = await getVideoTaskStatus(id);
    return noStore(status);
  } catch (e) {
    return handleError(e);
  }
}
