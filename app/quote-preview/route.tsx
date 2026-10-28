import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-static";

export async function GET() {
  const logo = await readFile(join(process.cwd(), "public", "bolt-logo.png"));
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#ffffff", alignItems: "center", justifyContent: "center", borderBottom: "24px solid #f5df26" }}>
      <img src={`data:image/png;base64,${logo.toString("base64")}`} width={980} height={169} alt="Bolt Tire" />
    </div>,
    { width: 1200, height: 630 },
  );
}
