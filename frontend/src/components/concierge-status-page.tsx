import "./concierge-status-page.css";

type ConciergeStatusPageProps = {
  code: string;
  title: string;
  lead: string;
  terminal?: string;
  primaryHref?: string;
  primaryLabel?: string;
};

export function ConciergeStatusPage({
  code,
  title,
  lead,
  terminal = "concierge --status",
  primaryHref = "/lounge",
  primaryLabel = "Executive Lounge",
}: ConciergeStatusPageProps) {
  return (
    <div className="concierge-status-page">
      <div className="concierge-status-ambient" aria-hidden="true">
        <div className="concierge-status-blob concierge-status-blob--blue" />
        <div className="concierge-status-blob concierge-status-blob--gold" />
      </div>
      <div className="concierge-status-shell">
        <div className="concierge-status-logo">
          <img
            src="/images/the-concierge-logo.png"
            alt="The Concierge"
            width={72}
            height={72}
          />
        </div>
        <div className="concierge-status-code" aria-hidden="true">
          {code}
        </div>
        <h1 className="concierge-status-title">{title}</h1>
        <p className="concierge-status-lead">{lead}</p>
        <nav className="concierge-status-actions" aria-label="Recovery links">
          <a className="concierge-status-btn gold" href={primaryHref}>
            {primaryLabel}
          </a>
          <a className="concierge-status-btn" href="/agent">
            Agent Hub
          </a>
          <a className="concierge-status-btn" href="/docs">
            Documentation
          </a>
        </nav>
        <p className="concierge-status-term" aria-hidden="true">
          <span className="prompt">$</span> {terminal}
        </p>
      </div>
    </div>
  );
}
