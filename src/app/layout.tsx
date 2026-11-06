import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { currentUser } from "@/server/auth/current";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "StackQuest", template: "%s · StackQuest" },
  description: "Team learning for Python, Linux, JavaScript and networking through realistic missions.",
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: "#04060c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html
      lang="en"
      data-theme={user?.theme === "light" ? "light" : "dark"}
      data-reduce-motion={user?.reduceMotion ? "true" : "false"}
      className={`${inter.variable} ${mono.variable} ${grotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
