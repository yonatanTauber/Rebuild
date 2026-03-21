import type { Metadata } from "next";
import { Be_Vietnam_Pro, Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/shell";

const display = Be_Vietnam_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-display"
});

const body = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "Rebuild",
  description: "מאמן עומס אישי לריצה, שחייה ואופניים"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className={`${display.variable} ${body.variable}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
