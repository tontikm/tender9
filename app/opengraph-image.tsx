import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Tender9: SA government tender monitoring";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0f2422",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 48 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "#0f766e",
              color: "#ffffff",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            T9
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#ffffff" }}>Tender9</div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.15,
            maxWidth: 980,
          }}
        >
          Never miss a government tender your business can win.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#8fb3ae", marginTop: 32 }}>
          Every open SA government tender, matched to your business
        </div>
      </div>
    ),
    { ...size }
  );
}
