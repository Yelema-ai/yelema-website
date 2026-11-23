const NOTETAKER = "djeneba";

const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

const tail = (name: string) => (name.includes("__") ? name.slice(name.lastIndexOf("__") + 2) : name);

export const isNotetaker = (...names: (string | null | undefined)[]): boolean =>
  names.some((name) => typeof name === "string" && slug(tail(name)).split("-").includes(NOTETAKER));
