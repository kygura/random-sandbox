/* The notes under the topic: a Tiptap editor with Markdown shortcuts,
   a bubble menu on selection and a / command menu. */
import { Editor, Extension, StarterKit, Placeholder, CharacterCount, BubbleMenu, Suggestion } from "/vendor/tiptap.js";

export const NOTES_LIMIT = 2000;

/* ---------- Markdown out, for the prompt ---------- */
function inline(nodes = []) {
  return nodes.map((n) => {
    if (n.type === "hardBreak") return "\n";
    if (n.type !== "text") return "";
    let t = n.text || "";
    for (const m of n.marks || []) {
      if (m.type === "code") t = "`" + t + "`";
      else if (m.type === "bold") t = "**" + t + "**";
      else if (m.type === "italic") t = "*" + t + "*";
      else if (m.type === "strike") t = "~~" + t + "~~";
      else if (m.type === "link" && m.attrs?.href) t = `[${t}](${m.attrs.href})`;
    }
    return t;
  }).join("");
}
function block(n, indent = "") {
  const c = n.content || [];
  switch (n.type) {
    case "paragraph": return indent + inline(c);
    case "heading": return "#".repeat(n.attrs?.level || 2) + " " + inline(c);
    case "blockquote": return c.map((x) => block(x)).join("\n\n").split("\n").map((l) => "> " + l).join("\n");
    case "horizontalRule": return "---";
    case "codeBlock": return "```\n" + inline(c) + "\n```";
    case "bulletList": case "orderedList":
      return c.map((li, i) => {
        const mark = n.type === "bulletList" ? "- " : `${(n.attrs?.start || 1) + i}. `;
        const [first, ...rest] = li.content || [];
        const head = indent + mark + (first ? block(first).trimStart() : "");
        const tail = rest.map((x) => block(x, indent + "  ")).join("\n");
        return tail ? head + "\n" + tail : head;
      }).join("\n");
    default: return c.length ? c.map((x) => block(x, indent)).join("\n") : "";
  }
}
export function docToMarkdown(doc) {
  return (doc?.content || []).map((n) => block(n)).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
/* Older saves kept notes as plain text. */
export function textToDoc(text) {
  const paras = String(text || "").split(/\n{2,}|\n/).filter((p) => p.trim());
  return { type: "doc", content: paras.length ? paras.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })) : [{ type: "paragraph" }] };
}

/* ---------- Commands ---------- */
const FORMAT = [
  { key: "text", t: "Text", d: "Plain paragraph", k: "", run: (c) => c.setParagraph() },
  { key: "heading", t: "Heading", d: "Section title", k: "##", run: (c) => c.setHeading({ level: 2 }) },
  { key: "subheading", t: "Subheading", d: "Smaller title", k: "###", run: (c) => c.setHeading({ level: 3 }) },
  { key: "bullets", t: "Bulleted list", d: "Points to cover", k: "-", run: (c) => c.toggleBulletList() },
  { key: "numbered", t: "Numbered list", d: "Ordered steps", k: "1.", run: (c) => c.toggleOrderedList() },
  { key: "quote", t: "Quote", d: "A passage to work from", k: ">", run: (c) => c.toggleBlockquote() },
  { key: "divider", t: "Divider", d: "Split the note", k: "---", run: (c) => c.setHorizontalRule() },
];

export function createNotesEditor({ el, bubble, slash, placeholder, actions = [], onChange, onSubmit, onExitTop }) {
  const items = [...FORMAT.map((x) => ({ ...x, group: "Format" })), ...actions.map((x) => ({ ...x, group: "Actions" }))];
  const menu = { items: [], sel: 0, cmd: null };

  const renderMenu = () => {
    slash.replaceChildren();
    if (!menu.items.length) { const p = document.createElement("div"); p.className = "none"; p.textContent = "No command by that name."; slash.append(p); return; }
    let group = "";
    menu.items.forEach((it, i) => {
      if (it.group !== group) { group = it.group; const g = document.createElement("div"); g.className = "g"; g.textContent = group; slash.append(g); }
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "option"); b.setAttribute("aria-selected", String(i === menu.sel));
      b.innerHTML = '<span class="t"></span><span class="d"></span><span class="k"></span>';
      b.children[0].textContent = it.t; b.children[1].textContent = it.d; b.children[2].textContent = it.k || "";
      b.addEventListener("mousedown", (ev) => { ev.preventDefault(); menu.cmd?.(it); });
      slash.append(b);
      if (i === menu.sel) queueMicrotask(() => b.scrollIntoView({ block: "nearest" }));
    });
  };
  const place = (rect) => {
    if (!rect) return;
    const host = slash.offsetParent?.getBoundingClientRect() || { top: 0, left: 0, width: innerWidth };
    slash.style.top = rect.bottom - host.top + 6 + "px";
    slash.style.left = Math.max(0, Math.min(rect.left - host.left, host.width - 268)) + "px";
  };

  const SlashCommands = Extension.create({
    name: "slashCommands",
    addProseMirrorPlugins() {
      return [Suggestion({
        editor: this.editor, char: "/",
        items: ({ query }) => { const q = query.toLowerCase(); return items.filter((x) => x.key.startsWith(q) || x.t.toLowerCase().includes(q)); },
        command: ({ editor, range, props }) => {
          const chain = editor.chain().focus().deleteRange(range);
          if (props.group === "Format") props.run(chain).run();
          else { chain.run(); props.run(); }
        },
        render: () => ({
          onStart: (p) => { menu.items = p.items; menu.sel = 0; menu.cmd = p.command; renderMenu(); slash.hidden = false; place(p.clientRect?.()); },
          onUpdate: (p) => { menu.items = p.items; menu.sel = Math.min(menu.sel, Math.max(0, p.items.length - 1)); menu.cmd = p.command; renderMenu(); place(p.clientRect?.()); },
          onKeyDown: ({ event }) => {
            const n = menu.items.length;
            if (event.key === "ArrowDown") { menu.sel = n ? (menu.sel + 1) % n : 0; renderMenu(); return true; }
            if (event.key === "ArrowUp") { menu.sel = n ? (menu.sel + n - 1) % n : 0; renderMenu(); return true; }
            if (event.key === "Enter" && !(event.metaKey || event.ctrlKey)) { if (n) menu.cmd?.(menu.items[menu.sel]); return true; }
            if (event.key === "Escape") { slash.hidden = true; event.stopPropagation(); return true; }
            return false;
          },
          onExit: () => { slash.hidden = true; },
        }),
      })];
    },
  });

  const Keys = Extension.create({
    name: "noteKeys",
    addKeyboardShortcuts() {
      return {
        "Mod-Enter": () => { onSubmit?.(); return true; },
        Backspace: ({ editor }) => {
          if (editor.isEmpty && editor.state.selection.from <= 1) { onExitTop?.(); return true; }
          return false;
        },
        ArrowUp: ({ editor }) => {
          if (editor.state.selection.from <= 1) { onExitTop?.(); return true; }
          return false;
        },
      };
    },
  });

  const editor = new Editor({
    element: el,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", protocols: ["http", "https"], HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      }),
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: NOTES_LIMIT }),
      BubbleMenu.configure({ element: bubble, appendTo: () => document.body, options: { placement: "top", offset: 8, flip: true, shift: { padding: 12 } } }),
      SlashCommands, Keys,
    ],
    editorProps: { attributes: { class: "note-body", "aria-label": "Notes to steer the research", "aria-multiline": "true", role: "textbox", spellcheck: "true" } },
    onUpdate: () => onChange?.(),
  });

  /* Bubble menu: buttons carry data-cmd; their pressed state follows the selection. */
  const RUN = {
    bold: (c) => c.toggleBold(), italic: (c) => c.toggleItalic(), strike: (c) => c.toggleStrike(), code: (c) => c.toggleCode(),
    h2: (c) => c.toggleHeading({ level: 2 }), h3: (c) => c.toggleHeading({ level: 3 }),
    bullets: (c) => c.toggleBulletList(), quote: (c) => c.toggleBlockquote(),
  };
  const ACTIVE = { bold: ["bold"], italic: ["italic"], strike: ["strike"], code: ["code"], h2: ["heading", { level: 2 }], h3: ["heading", { level: 3 }], bullets: ["bulletList"], quote: ["blockquote"], link: ["link"] };
  bubble.addEventListener("mousedown", (ev) => ev.preventDefault());
  bubble.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-cmd]"); if (!b) return;
    const cmd = b.dataset.cmd;
    if (cmd === "link") {
      if (editor.isActive("link")) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
      const url = (prompt("Link to", "https://") || "").trim();
      if (/^https?:\/\/\S+$/i.test(url)) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      return;
    }
    RUN[cmd]?.(editor.chain().focus()).run();
  });
  const syncBubble = () => bubble.querySelectorAll("button[data-cmd]").forEach((b) => b.setAttribute("aria-pressed", String(editor.isActive(...ACTIVE[b.dataset.cmd]))));
  editor.on("selectionUpdate", syncBubble); editor.on("transaction", syncBubble);

  return {
    editor,
    getMarkdown: () => docToMarkdown(editor.getJSON()).slice(0, NOTES_LIMIT),
    getJSON: () => editor.getJSON(),
    isEmpty: () => editor.isEmpty,
    setContent: (doc) => editor.commands.setContent(doc && doc.type === "doc" ? doc : textToDoc(doc), { emitUpdate: false }),
    // Synchronous, so keys typed right after Enter in the title land here.
    focusStart: () => { editor.view.focus(); editor.commands.setTextSelection(1); },
    focusEnd: () => editor.commands.focus("end"),
  };
}
