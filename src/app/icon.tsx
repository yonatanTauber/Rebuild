import { ImageResponse } from "next/og";

export const size = {
  width: 128,
  height: 128
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#fff6f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <div
          style={{
            width: 92,
            height: 54,
            borderRadius: 14,
            background: "#D62828",
            border: "4px solid #8F1010",
            position: "relative",
            display: "flex"
          }}
        >
          <div style={{ position: "absolute", top: -12, right: 15, width: 16, height: 16, borderRadius: 999, background: "#FF8989", border: "3px solid #8F1010" }} />
          <div style={{ position: "absolute", top: -12, right: 38, width: 16, height: 16, borderRadius: 999, background: "#FF8989", border: "3px solid #8F1010" }} />
          <div style={{ position: "absolute", top: -12, right: 61, width: 16, height: 16, borderRadius: 999, background: "#FF8989", border: "3px solid #8F1010" }} />
        </div>
      </div>
    ),
    size
  );
}
