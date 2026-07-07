import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import statusCss from "../components/concierge-status-page.css?url";
import { ConciergeStatusPage } from "../components/concierge-status-page";

function NotFoundComponent() {
  return (
    <ConciergeStatusPage
      code="404"
      title="Intelligence not found"
      lead="This route isn't on the Concierge desk. The page may have moved, or the URL was mistyped."
      terminal="concierge --route-not-found"
    />
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

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
          500
        </div>
        <h1 className="concierge-status-title">Desk interrupted</h1>
        <p className="concierge-status-lead">
          Something went wrong loading this view. Refresh or return to the Lounge.
        </p>
        <nav className="concierge-status-actions" aria-label="Recovery actions">
          <button
            type="button"
            className="concierge-status-btn gold"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </button>
          <a className="concierge-status-btn" href="/lounge">
            Executive Lounge
          </a>
          <a className="concierge-status-btn" href="/agent">
            Agent Hub
          </a>
        </nav>
        <p className="concierge-status-term" aria-hidden="true">
          <span className="prompt">$</span> concierge --recover
        </p>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Executive Lounge" },
      { name: "description", content: "Private intelligence terminal for markets and the onchain economy." },
      { name: "author", content: "Executive Lounge" },
      { property: "og:title", content: "Executive Lounge" },
      { property: "og:description", content: "Private intelligence terminal for markets and the onchain economy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Th3concierge_" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: statusCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=DM+Mono:wght@400&family=Outfit:wght@300;400;500&display=swap",
      },
      { rel: "icon", href: "/images/the-concierge-logo.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <HeadContent />
      </head>
      <body style={{ margin: 0 }}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
