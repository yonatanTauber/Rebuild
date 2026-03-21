import type { Metadata } from "next";
import { Rubik, Secular_One } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/shell";

const display = Secular_One({
  subsets: ["latin", "hebrew"],
  weight: ["400"],
  variable: "--font-display"
});

const body = Rubik({
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "700"],
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
      <body className={`${display.variable} ${body.variable}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
