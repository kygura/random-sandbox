import { test } from "node:test";
import assert from "node:assert/strict";
import { tierOf, rankOf } from "../public/provenance.js";

test("sources are ranked by how close they are to the original record", () => {
  const cases = {
    "https://www.archives.gov/research/military": "official",
    "https://www.legislation.gov.uk/ukpga/2018/12": "official",
    "https://www.mext.go.jp/a_menu/": "official",
    "https://patents.google.com/patent/US123": "official",
    "https://eur-lex.europa.eu/legal-content/EN/TXT/": "official",
    "https://beinecke.library.yale.edu/collections/voynich": "archive",
    "https://archive.org/details/voynich": "archive",
    "https://www.metmuseum.org/art/collection/search/1": "archive",
    "https://collections.example.org/item/7": "archive",
    "https://doi.org/10.1371/journal.pone.0066344": "scholarly",
    "https://www.cs.ox.ac.uk/paper.pdf": "scholarly",
    "https://plato.stanford.edu/entries/x/": "scholarly",
    "https://en.wikipedia.org/wiki/Voynich_manuscript": "reference",
    "https://www.bbc.co.uk/news/1": "press",
    "https://www.smithsonianmag.com/history/x": "press",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC3689824/": "scholarly",
    "https://ceur-ws.org/Vol-3313/paper4.pdf": "scholarly",
    "https://arstechnica.com/science/2024/09/x": "press",
    "https://someones-blog.net/post": "web",
    "https://abc.go.com/shows": "web",
    "https://www.youtube.com/watch?v=abc": "video",
  };
  for (const [u, t] of Object.entries(cases)) assert.equal(tierOf(u), t, u);
  assert.ok(rankOf("official") < rankOf("archive") && rankOf("archive") < rankOf("scholarly") && rankOf("web") < rankOf("video"));
});
