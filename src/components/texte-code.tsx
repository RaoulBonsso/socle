import { Fragment } from "react";

/** Met en forme le `code en ligne` des cartes, sans interpréter de HTML. */
export function TexteCode({ texte }: { texte: string }) {
  return (
    <>
      {texte.split(/(`[^`\n]+`)/g).map((m, i) =>
        m.startsWith("`") && m.endsWith("`") && m.length > 2 ? (
          <code key={i} className="rounded border border-ligne bg-surface-2 px-1.5 py-0.5 font-mono text-[0.88em]">{m.slice(1, -1)}</code>
        ) : (
          <Fragment key={i}>{m}</Fragment>
        ),
      )}
    </>
  );
}
