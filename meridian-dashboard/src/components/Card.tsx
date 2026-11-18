import type { ReactNode } from "react";

/** Panel frame used by every section: kicker, serif title, optional subtitle, actions, body, footer note. */
export function Card(props: {
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  foot?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card ${props.className ?? ""}`}>
      <header className="card-head">
        <div>
          <div className="kicker">{props.kicker}</div>
          <h2>{props.title}</h2>
          {props.subtitle && <p>{props.subtitle}</p>}
        </div>
        {props.actions && <div>{props.actions}</div>}
      </header>
      <div className="card-body">{props.children}</div>
      {props.foot && <footer className="card-foot">{props.foot}</footer>}
    </section>
  );
}

/** Fixed-position tooltip that follows the pointer. Pass null to hide. */
export function Tip({ at, children }: { at: { x: number; y: number } | null; children: ReactNode }) {
  if (!at) return null;
  const left = Math.min(at.x + 14, window.innerWidth - 280);
  const top = Math.min(at.y + 14, window.innerHeight - 160);
  return (
    <div className="tip" style={{ left, top }}>
      {children}
    </div>
  );
}
