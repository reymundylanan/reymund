import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { BookingProvider } from "@/components/booking/BookingContext";
import { LoginModalProvider } from "@/components/auth/LoginModalContext";
import ChatWidgetWrapper from "@/components/ChatWidgetWrapper";
import IntentHandler from "@/components/notifications/IntentHandler";
import ClientNotificationToaster from "@/components/notifications/ClientNotificationToaster";
import PromoSideAd from "@/components/promos/PromoSideAd";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Elegant serif for public/client headings and the brand name.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Blush Spa & Aesthetics",
  description:
    "Book wellness spa services, manage appointments, and synchronize your glow with GlowSync.",
  icons: {
    icon: "/images/logo/cropblushicon2.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="theme-warm min-h-full flex flex-col">
        {/* Browser autofill extensions (e.g. Edge's) stamp attributes such as
            fdprocessedid onto inputs and buttons before React hydrates, which
            shows a hydration-mismatch warning. Strip them until hydration is done. */}
        <Script id="strip-extension-attrs" strategy="beforeInteractive">
          {`(function(){var A=["fdprocessedid","__gchrome_uniqueid","data-lastpass-icon-root"];function clean(r){A.forEach(function(a){r.querySelectorAll("["+a+"]").forEach(function(e){e.removeAttribute(a)})})}clean(document);var o=new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==="attributes"&&m.attributeName){m.target.removeAttribute(m.attributeName)}})});o.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:A});setTimeout(function(){o.disconnect()},15000)})();`}
        </Script>
        <LoginModalProvider>
          <BookingProvider>
            {children}
            <Suspense fallback={null}>
              <IntentHandler />
            </Suspense>
            <PromoSideAd />
          </BookingProvider>
          <ChatWidgetWrapper />
          <ClientNotificationToaster />
        </LoginModalProvider>
      </body>
    </html>
  );
}
