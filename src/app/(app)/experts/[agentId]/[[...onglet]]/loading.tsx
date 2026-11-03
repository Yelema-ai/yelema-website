// An expert's space while it opens: its header, its tabs and the chat bar in place, so the click
// in the menu shows at once where it leads.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" className="flex min-h-0 flex-1 animate-pulse flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-4 md:px-6">
        <div className="size-12 shrink-0 rounded-full bg-soft-2" />
        <div className="min-w-0">
          <div className="h-5 w-40 rounded bg-soft-2" />
          <div className="mt-2 h-3.5 w-56 max-w-full rounded bg-soft" />
        </div>
      </div>
      <div className="flex gap-5 border-b border-line px-4 py-3 md:px-6">
        {[72, 52, 60, 70, 64].map((w, i) => (
          <div key={i} className="h-4 rounded bg-soft" style={{ width: w }} />
        ))}
      </div>
      <div className="mx-auto mt-auto w-full max-w-3xl px-4 pb-6 md:px-6">
        <div className="h-28 rounded-card border border-line bg-soft" />
      </div>
    </div>
  );
}
