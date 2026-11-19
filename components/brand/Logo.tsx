import { APP_NAME } from "@/lib/content/app";

// Yazılı logo (Figma 01 · Logo). Krem/beyaz zeminde "logo.svg", koyu zeminde "logo-koyu.svg".
// En küçük genişlik 96 px; daha dar alanlarda sade sembol kullanılır. Oran 480 × 200.

export function Logo({ width = 96, tone = "light", className }: { width?: number; tone?: "light" | "dark"; className?: string }) {
  const w = Math.max(96, width);
  const height = Math.round((w * 200) / 480);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === "dark" ? "/brand/logo-koyu.svg" : "/brand/logo.svg"}
      width={w}
      height={height}
      alt={APP_NAME}
      className={className}
      draggable={false}
    />
  );
}
