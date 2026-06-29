import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BookingProvider } from "@/components/booking/BookingContext";
import { LoginModalProvider } from "@/components/auth/LoginModalContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GlowSync — Synchronized Care for Your Natural Glow",
  description:
    "Book wellness spa services, manage appointments, and synchronize your glow with GlowSync.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LoginModalProvider>
          <BookingProvider>{children}</BookingProvider>
        </LoginModalProvider>
      </body>
    </html>
  );
}
