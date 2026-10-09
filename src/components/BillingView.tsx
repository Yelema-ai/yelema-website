"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// The shapes of GET /api/billing, as the back office gives them (see BoBilling, BoInvoice).
interface Invoice {
  id: string;
  reference: string;
  period: string;
  status: string;
  amountTTC: number;
  currency: string;
  issuedAt: string | null;
  dueDate: string | null;
  payable: boolean;
}

interface Billing {
  plan: { key: string; name: string } | null;
  status: string | null;
  nextDueDate: string | null;
  amount: number | null;
  currency: string;
  openInvoice: Invoice | null;
}

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  paid: { label: "Payée", variant: "success" },
  issued: { label: "À régler", variant: "secondary" },
  overdue: { label: "En retard", variant: "warning" },
};

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("fr-FR").format(amount)} ${currency}`;
  }
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—");

// "2026-10" -> "octobre 2026".
function month(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// The workspace's plan, next due date and invoices, read from the back office. "Payer" opens the
// back office's own payment page in a new tab; there is no way back from it into the app, so the
// invoices are read again whenever this tab is looked at again.
export function BillingView() {
  const [data, setData] = useState<{ billing: Billing; invoices: Invoice[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<{ billing: Billing; invoices: Invoice[] }>("/api/billing"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const onBack = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [load]);

  async function pay(invoice: Invoice) {
    // Opened on the click itself: a tab opened after the answer would be blocked as a pop-up.
    const tab = window.open("", "_blank");
    setPaying(invoice.id);
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/billing/invoices/${invoice.id}/payment-link`, { method: "POST" });
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (e) {
      tab?.close();
      toast.error((e as Error).message);
      void load();
    } finally {
      setPaying(null);
    }
  }

  const title = <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Facturation</h1>;

  if (!data) {
    return (
      <div>
        {title}
        {error ? (
          <p className="mt-4 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </p>
        )}
      </div>
    );
  }

  const { billing, invoices } = data;
  const open = billing.openInvoice;

  return (
    <div className="max-w-5xl">
      {title}

      <section className="mt-5 grid gap-4 rounded-[22px] border border-line bg-surface p-5 sm:grid-cols-3 sm:p-6">
        <div>
          <p className="text-[13px] font-semibold text-ink-3">Forfait</p>
          <p className="mt-1 font-display text-xl font-bold text-ink">{billing.plan?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink-3">Mensualité</p>
          <p className="mt-1 font-display text-xl font-bold text-ink">
            {billing.amount == null ? "—" : money(billing.amount, billing.currency)}
          </p>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink-3">Prochaine échéance</p>
          <p className="mt-1 font-display text-xl font-bold text-ink">{day(billing.nextDueDate)}</p>
        </div>
      </section>

      {open?.payable && (
        <section className="mt-4 flex flex-wrap items-center gap-3 rounded-[22px] border-2 border-brand bg-surface p-5">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">
              Facture {open.reference} à régler : {money(open.amountTTC, open.currency)}
            </p>
            <p className="text-[13px] text-ink-3">
              {open.status === "overdue" ? "En retard depuis le" : "À régler avant le"} {day(open.dueDate)}.
            </p>
          </div>
          <Button onClick={() => pay(open)} disabled={paying !== null}>
            {paying === open.id && <Loader2 className="animate-spin" />}
            Payer
          </Button>
        </section>
      )}

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">Factures</h2>
      {invoices.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">Aucune facture pour le moment.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-soft text-left text-xs text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium">Référence</th>
                <th className="px-4 py-2.5 font-medium">Période</th>
                <th className="px-4 py-2.5 font-medium">Échéance</th>
                <th className="px-4 py-2.5 text-right font-medium">Montant TTC</th>
                <th className="px-4 py-2.5 font-medium">État</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const status = STATUS[inv.status];
                return (
                  <tr key={inv.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium text-ink">{inv.reference}</td>
                    <td className="px-4 py-3 text-ink-2">{month(inv.period)}</td>
                    <td className="px-4 py-3 text-ink-2">{day(inv.dueDate)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink">
                      {money(inv.amountTTC, inv.currency)}
                    </td>
                    <td className="px-4 py-3">{status ? <Badge variant={status.variant}>{status.label}</Badge> : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <a href={`/api/billing/invoices/${inv.id}/pdf`} download aria-label={`Télécharger la facture ${inv.reference}`}>
                            <Download /> PDF
                          </a>
                        </Button>
                        {inv.payable && (
                          <Button size="sm" onClick={() => pay(inv)} disabled={paying !== null}>
                            {paying === inv.id && <Loader2 className="animate-spin" />}
                            Payer
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
