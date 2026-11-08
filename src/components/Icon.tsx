import type { ReactNode } from "react";

export type IconName =
  | "chart" | "monitor" | "gamepad" | "target" | "building" | "laptop" | "reset"
  | "map-pin" | "globe" | "send" | "sparkles" | "user" | "compass" | "briefcase"
  | "graduation-cap" | "puzzle" | "file" | "sliders" | "link" | "palette"
  | "bookmark" | "wrench" | "mic" | "trophy" | "archive" | "sun" | "moon"
  | "smartphone" | "glasses";

const glyphs: Record<IconName, ReactNode> = {
  chart: <><path d="M3 3v18h18" /><path d="M8 16v-4M13 16V7M18 16V4" /></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  gamepad: <><path d="M6.5 8h11a4 4 0 0 1 3.9 4.9l-.8 3.3a2.5 2.5 0 0 1-4.1 1.3L14 15.5h-4l-2.5 2a2.5 2.5 0 0 1-4.1-1.3l-.8-3.3A4 4 0 0 1 6.5 8Z" /><path d="M7 10.5v4M5 12.5h4M16.5 11.5h.01M19 14h.01" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M11 21v-3h2v3" /></>,
  laptop: <><rect x="4" y="4" width="16" height="12" rx="1.5" /><path d="M2 20h20l-2-4H4l-2 4Z" /></>,
  reset: <><path d="M3 11a9 9 0 0 1 15.4-6.4L21 7" /><path d="M21 3v4h-4M21 13a9 9 0 0 1-15.4 6.4L3 17M3 21v-4h4" /></>,
  "map-pin": <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
  send: <><path d="m21 3-7.2 18-3.9-7.9L2 9.2 21 3Z" /><path d="M10 13 21 3" /></>,
  sparkles: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" /><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 3l.6 1.4L7 5l-1.4.6L5 7l-.6-1.4L3 5l1.4-.6L5 3Z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
  "graduation-cap": <><path d="m2 10 10-5 10 5-10 5-10-5Z" /><path d="M6 12v5c3.5 2.5 8.5 2.5 12 0v-5M22 10v6" /></>,
  puzzle: <><path d="M8 3h3a2 2 0 1 1 4 0h3v6a2 2 0 1 1 0 4v8h-6a2 2 0 1 0-4 0H3v-7a2 2 0 1 1 0-4V3h5Z" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
  sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M2 14h4M10 8h4M18 16h4" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.4-3.4 1.8 1.8 0 0 1 1.3-3.1H18a3 3 0 0 0 3-3c0-4.7-4-8.5-9-8.5Z" /><path d="M7.5 10h.01M10 7.5h.01M14.5 8h.01M17 10.5h.01" /></>,
  bookmark: <><path d="M6 3h12v18l-6-4-6 4V3Z" /></>,
  wrench: <><path d="M14.5 6.5a5 5 0 0 0-6.7 6.7L3 18l3 3 4.8-4.8a5 5 0 0 0 6.7-6.7L14 12l-3-3 3.5-2.5Z" /></>,
  mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v11h14V9M10 13h4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></>,
  moon: <><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z" /></>,
  smartphone: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></>,
  glasses: <><path d="M2 12h2l1.5-5h5L12 12l1.5-5h5L20 12h2" /><path d="M5.5 7 4 14a3 3 0 0 0 6 0l-1.5-7M18.5 7 20 14a3 3 0 0 1-6 0l1.5-7" /></>,
};

export default function Icon({ name, size = 16, className }: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg className={["ui-icon", className].filter(Boolean).join(" ")} viewBox="0 0 24 24"
      width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {glyphs[name]}
    </svg>
  );
}

export function platformIconName(value: string): IconName {
  const normalized = value.toLowerCase();
  if (normalized.includes("mobile")) return "smartphone";
  if (normalized.includes("vr") || normalized.includes("xr")) return "glasses";
  if (normalized.includes("web")) return "globe";
  if (normalized.includes("pc")) return "monitor";
  return "gamepad";
}
