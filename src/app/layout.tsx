import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio développeur IA",
  description:
    "Portfolio d’un développeur orienté intelligence artificielle, applications RAG, interfaces web modernes et produits full-stack.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark bg-background">
      <body>{children}</body>
    </html>
  );
}