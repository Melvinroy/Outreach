import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outreach — Private Relationship Workspace",
  description: "A secure, evidence-based workspace for professional outreach decisions and relationship outcomes.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
