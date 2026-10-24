import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eagles Financial Audit",
  description: "Season expenses, claims, audit, and settlement for Eagles teams.",
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
