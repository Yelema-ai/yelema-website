import { ExpertGallery } from "@/components/experts/ExpertGallery";

// Recruter: the showcase of the 11 experts, all already in the client's team.
export default function RecruterPage() {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-8">
      <ExpertGallery />
    </div>
  );
}
