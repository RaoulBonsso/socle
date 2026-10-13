import { Marked } from "marked";
import { createHighlighter, type Highlighter } from "shiki";

let surligneur: Promise<Highlighter> | null = null;
const LANGAGES = ["bash", "shell", "sh", "yaml", "json", "sql", "python", "typescript", "javascript", "tsx", "dockerfile", "hcl", "ini", "toml", "go", "text", "diff", "nginx"];

/** Rendu au build : le contenu vient du dépôt, la coloration syntaxique ne coûte rien au visiteur. */
export async function enHtml(md: string): Promise<string> {
  surligneur ??= createHighlighter({ themes: ["vitesse-dark"], langs: LANGAGES });
  const h = await surligneur;
  const marked = new Marked({
    renderer: {
      code({ text, lang }) {
        const l = lang && LANGAGES.includes(lang) ? lang : "text";
        return `<figure class="code"><figcaption>${l}</figcaption>${h.codeToHtml(text, { lang: l, theme: "vitesse-dark" })}</figure>`;
      },
      link({ href, text }) {
        const externe = /^https?:\/\//.test(href);
        return `<a href="${href}"${externe ? ' target="_blank" rel="noreferrer"' : ""}>${text}</a>`;
      },
      html() {
        return ""; // aucun HTML brut dans les leçons
      },
    },
  });
  return marked.parse(md, { async: false }) as string;
}
