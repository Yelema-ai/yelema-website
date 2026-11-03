import { backoffice } from "@/lib/backoffice";
import { noStore, settingsToken, vaultDraftFor, vaultError, vaultRefs } from "../_shared";

// `GET /api/vault/own` — toutes les connexions confiées aux experts de sa propre instance, en une lecture.
export async function GET() {
  try {
    return noStore(await backoffice.vaultOverview(await settingsToken()));
  } catch (e) {
    return vaultError(e);
  }
}

// `POST /api/vault/own` — un accès confié à plusieurs experts, en une commande sur l'instance.
export async function POST(request: Request) {
  try {
    const { draft, profiles } = await vaultDraftFor(request);
    return noStore(await backoffice.addVaultItems(await settingsToken(), profiles, draft));
  } catch (e) {
    return vaultError(e);
  }
}

// `DELETE /api/vault/own` — un accès retiré de plusieurs experts, en une commande.
export async function DELETE(request: Request) {
  try {
    return noStore(await backoffice.removeVaultItems(await settingsToken(), await vaultRefs(request)));
  } catch (e) {
    return vaultError(e);
  }
}
