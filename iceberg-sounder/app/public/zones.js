// Shared by the server (prompts) and the browser (drawing). Levels are fixed,
// ordered from what everyone knows down to what almost nobody does.
export const ZONES = [
  { key: "tip", level: 1, name: "Everyone knows", short: "Common knowledge",
    brief: "common knowledge most people have heard" },
  { key: "waterline", level: 2, name: "Newcomers learn", short: "An afternoon's reading",
    brief: "what a curious newcomer learns in an afternoon" },
  { key: "twilight", level: 3, name: "Enthusiasts know", short: "Names, dates, terms",
    brief: "enthusiast knowledge: named people, dates, technical terms" },
  { key: "midnight", level: 4, name: "Specialists know", short: "Scholarly detail",
    brief: "specialist and scholarly detail" },
  { key: "abyss", level: 5, name: "In the archives", short: "Primary sources",
    brief: "archival, primary-source, rarely discussed specifics" },
  { key: "trench", level: 6, name: "Contested", short: "Fringe and unresolved",
    brief: "fringe theories, disputed claims and unresolved questions" },
];
