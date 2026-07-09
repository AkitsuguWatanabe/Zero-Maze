import type { Metadata } from "next";
import "@/styles.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SessionTimeoutGuard } from "@/components/SessionTimeoutGuard";
import { FeedbackNotificationGuard } from "@/components/FeedbackNotificationGuard";
import { TeamProvider } from "@/lib/team-context";

export const metadata: Metadata = {
  metadataBase: new URL("https://instruction-support.vercel.app"),
  title: {
    default: "指示作成支援システム — 業務品質・生産性向上サポート",
    template: "%s — 指示作成支援システム",
  },
  description:
    "曖昧な指示を構造化し、4観点（目的・具体性・完了条件・制約）で品質を可視化。担当者が迷わない指示を、指示者が安心してGOできる形に整えます。",
  authors: [{ name: "Quality & Productivity Support Platform" }],
  openGraph: {
    title: "指示作成支援システム",
    description: "4観点で指示の質を可視化し、迷いを減らす業務支援システム。",
    type: "website",
  },
  twitter: { card: "summary" },
  icons: { icon: [{ url: "/favicon.png", type: "image/png" }] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <TeamProvider>
          <SessionTimeoutGuard />
          <FeedbackNotificationGuard />
          <SiteHeader />
          {children}
        </TeamProvider>
      </body>
    </html>
  );
}