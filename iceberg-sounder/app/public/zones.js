// Shared by the server (prompts) and the browser (drawing). Depth zones are fixed.
export const ZONES = [
  { key: "tip", name: "The Tip", depth: "+30 m", sci: "Above water", who: "What nearly everyone knows",
    brief: "common knowledge most people have heard" },
  { key: "waterline", name: "Waterline", depth: "0 m", sci: "Epipelagic", who: "What a curious newcomer learns",
    brief: "what a curious newcomer learns in an afternoon" },
  { key: "twilight", name: "Twilight Zone", depth: "−200 m", sci: "Mesopelagic", who: "Enthusiasts and fans",
    brief: "enthusiast knowledge: named people, dates, technical terms" },
  { key: "midnight", name: "Midnight Zone", depth: "−1,000 m", sci: "Bathypelagic", who: "Specialists and scholars",
    brief: "specialist and scholarly detail" },
  { key: "abyss", name: "The Abyss", depth: "−4,000 m", sci: "Abyssopelagic", who: "Archives and primary sources",
    brief: "archival, primary-source, rarely discussed specifics" },
  { key: "trench", name: "The Trench", depth: "−6,000 m", sci: "Hadal", who: "Fringe, contested, unresolved",
    brief: "fringe theories, disputed claims and unresolved questions" },
];
