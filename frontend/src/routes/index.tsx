import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Executive Lounge — Private Intelligence Lobby" },
      {
        name: "description",
        content:
          "A private intelligence terminal for participants in the onchain economy.",
      },
    ],
  }),
});

function Index() {
  useEffect(() => {
    window.location.replace("/lounge");
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#060810",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p
        style={{
          fontFamily: "Outfit, sans-serif",
          fontSize: 11,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color: "#7a8ea8",
        }}
      >
        Opening Executive Lounge…
      </p>
    </div>
  );
}
