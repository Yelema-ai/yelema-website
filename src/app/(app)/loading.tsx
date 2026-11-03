// Shown the moment a page of the app is asked for, while the server prepares it: the click has
// visibly landed, so nobody clicks again. The menu and the top bar stay where they are.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" className="mx-auto w-full max-w-5xl animate-pulse px-4 py-8 md:px-8">
      <div className="h-7 w-56 rounded-lg bg-soft-2" />
      <div className="mt-3 h-4 w-80 max-w-full rounded bg-soft" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-24 rounded-card bg-soft" />
        ))}
      </div>
    </div>
  );
}
