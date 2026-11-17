/* How close a source is to the original record. Used by the server to order
   citations and by the page to label them. Lower rank = closer to the source. */

export const TIERS = {
  official: { rank: 0, label: "Official record" },
  archive: { rank: 1, label: "Archive" },
  scholarly: { rank: 2, label: "Scholarly" },
  reference: { rank: 3, label: "Reference" },
  press: { rank: 4, label: "Press" },
  web: { rank: 5, label: "Web" },
  video: { rank: 6, label: "Video" },
};

/* Paper repositories that happen to sit on government hosts. */
const SCHOLARLY_FIRST = [/(^|\.)ncbi\.nlm\.nih\.gov$/, /(^|\.)pubmed\./, /(^|\.)osti\.gov$/, /(^|\.)ntrs\.nasa\.gov$/, /(^|\.)eric\.ed\.gov$/];
const OFFICIAL_HOST = [
  /\.(gov|mil)$/, /\.(gov|gob|gouv|govt|gv|mil)\.[a-z]{2}$/, /\.go\.(jp|kr|id|th|ke|tz|ug|cr)$/,
  /\.gc\.ca$/, /\.admin\.ch$/, /\.bund\.de$/, /\.gouv\.fr$/, /\.int$/,
  /(^|\.)europa\.eu$/, /(^|\.)un\.org$/, /(^|\.)oecd\.org$/, /(^|\.)worldbank\.org$/, /(^|\.)imf\.org$/,
  /(^|\.)parliament\.uk$/, /(^|\.)legislation\.gov\.uk$/, /(^|\.)courtlistener\.com$/, /(^|\.)supremecourt\.gov$/,
  /^patents\.google\.com$/, /(^|\.)espacenet\.com$/, /(^|\.)wipo\.int$/, /(^|\.)sec\.gov$/,
];
const ARCHIVE_HOST = [
  /(^|\.)archive\.org$/, /(^|\.)hathitrust\.org$/, /(^|\.)europeana\.eu$/, /(^|\.)dp\.la$/, /(^|\.)wikisource\.org$/,
  /(^|\.)gutenberg\.org$/, /(^|\.)chroniclingamerica\.loc\.gov$/, /(^|\.)trove\.nla\.gov\.au$/, /(^|\.)bl\.uk$/,
  /(^|\.)bnf\.fr$/, /(^|\.)si\.edu$/, /(^|\.)wellcomecollection\.org$/, /(^|\.)newspapers\.com$/,
  /(^|\.)metmuseum\.org$/, /(^|\.)britishmuseum\.org$/, /(^|\.)rijksmuseum\.nl$/, /(^|\.)louvre\.fr$/, /(^|\.)vam\.ac\.uk$/,
  /(^|\.)artsandculture\.google\.com$/, /(^|\.)e-codices\.unifr\.ch$/, /(^|\.)digi\.vatlib\.it$/,
  /(^|[.-])(archives?|archiv|museum|museo|musee|library|libraries|bibliotheque|biblioteca|bibliothek)([.-]|$)/,
  /(^|\.)(digital|digitalcollections|collections|special-?collections)\./,
];
const SCHOLARLY_HOST = [
  /\.edu$/, /\.(edu|ac)\.[a-z]{2}$/, /(^|\.)doi\.org$/, /(^|\.)jstor\.org$/, /(^|\.)arxiv\.org$/, /(^|\.)biorxiv\.org$/,
  /(^|\.)ncbi\.nlm\.nih\.gov$/, /(^|\.)nature\.com$/, /(^|\.)science\.org$/, /(^|\.)sciencedirect\.com$/,
  /(^|\.)springer\.com$/, /(^|\.)wiley\.com$/, /(^|\.)tandfonline\.com$/, /(^|\.)cambridge\.org$/, /(^|\.)oup\.com$/,
  /(^|\.)sagepub\.com$/, /(^|\.)plos\.org$/, /(^|\.)frontiersin\.org$/, /(^|\.)mdpi\.com$/, /(^|\.)ssrn\.com$/,
  /(^|\.)semanticscholar\.org$/, /(^|\.)researchgate\.net$/, /(^|\.)philpapers\.org$/, /(^|\.)aclanthology\.org$/,
  /(^|\.)ieee\.org$/, /(^|\.)acm\.org$/, /(^|\.)ceur-ws\.org$/, /(^|\.)hal\.science$/, /(^|\.)zenodo\.org$/, /(^|\.)scholar\.archive\.org$/, /(^|\.)openalex\.org$/,
];
const REFERENCE_HOST = [
  /(^|\.)wikipedia\.org$/, /(^|\.)wikimedia\.org$/, /(^|\.)britannica\.com$/, /(^|\.)worldhistory\.org$/,
  /(^|\.)encyclopedia\.com$/, /(^|\.)oxfordreference\.com$/,
];
const PRESS_HOST = [
  /(^|\.)(nytimes|washingtonpost|wsj|latimes|theguardian|theatlantic|newyorker|economist|reuters|apnews|npr|pbs|time|cnn|nbcnews|cbsnews|abcnews|aljazeera|smithsonianmag|nationalgeographic|scientificamerican|newscientist|lemonde|spiegel|elpais|ft|bloomberg|axios|politico)\.(com|org|co\.uk|de|fr|es)$/,
  /(^|\.)(arstechnica|wired|historytoday|theartnewspaper|livescience|vox|slate|qz|nautil|aeon|newstatesman|independent|telegraph|thetimes|usatoday)\.(com|co\.uk|us|co)$/,
  /(^|\.)bbc\.(co\.uk|com)$/, /(^|\.)abc\.net\.au$/, /(^|\.)cbc\.ca$/, /(^|\.)theconversation\.com$/,
];
const VIDEO = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//i;

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const any = (list, host) => list.some((re) => re.test(host));

export function tierOf(url) {
  const u = String(url || "");
  if (VIDEO.test(u)) return "video";
  const host = hostOf(u);
  if (!host) return "web";
  // Order matters: a museum on a .gov host is official, a library on .edu is an archive.
  if (any(SCHOLARLY_FIRST, host)) return "scholarly";
  if (any(OFFICIAL_HOST, host)) return "official";
  if (any(ARCHIVE_HOST, host)) return "archive";
  if (any(SCHOLARLY_HOST, host)) return "scholarly";
  if (any(REFERENCE_HOST, host)) return "reference";
  if (any(PRESS_HOST, host)) return "press";
  return "web";
}

export const rankOf = (tier) => (TIERS[tier] || TIERS.web).rank;
export const labelOf = (tier) => (TIERS[tier] || TIERS.web).label;
