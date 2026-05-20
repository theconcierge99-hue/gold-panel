import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Executive Lounge — Private Intelligence Terminal" },
      {
        name: "description",
        content:
          "A private intelligence terminal for participants in the autonomous economy.",
      },
    ],
  }),
});

function Index() {
  return (
    <iframe
      src="/executive-lounge.html"
      title="Executive Lounge"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        border: 0,
      }}
    />
  );
}
