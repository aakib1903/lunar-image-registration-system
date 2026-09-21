import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./phase1.css";

export const metadata: Metadata = {
  title: "LUNARIS — Lunar Correspondence & Registration",
  description: "A real-data-first architecture and mission-planning workspace for generic lunar image correspondence and registration. Smart India Hackathon problem statement #26166.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to main content</a>{children}</body></html>;
}
