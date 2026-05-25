import { ImageResponse } from "next/og";

export const alt =
  "TradeOps Console: four AI agents for a trade ops desk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const AGENTS = ["Invoice Extractor", "Inbox Triager", "Compliance", "Trade Q&A"];

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#fafafa",
          padding: "80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: "#737373",
              letterSpacing: 6,
              fontWeight: 600,
              marginBottom: 28,
            }}
          >
            TRADEOPS CONSOLE
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 80,
              fontWeight: 700,
              color: "#0a0a0a",
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            Four AI agents for a trade ops desk.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#525252",
              lineHeight: 1.4,
              maxWidth: 950,
              marginTop: 28,
            }}
          >
            Reasoning streams token by token. Tool calls render as cards.
          </div>
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {AGENTS.map((name) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  padding: "12px 22px",
                  borderRadius: 999,
                  background: "#0a0a0a",
                  color: "#fafafa",
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: -0.2,
                }}
              >
                {name}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: "#737373",
              fontWeight: 500,
            }}
          >
            tradeops-console.vercel.app
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
