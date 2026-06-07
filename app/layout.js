import { Inter } from "next/font/google";
import BouncingBall from "./components/BouncingBall";
import Menu from "./components/Menu";
import MobileMenu from "./components/MobileMenu";
import ScrollLockOnLanding from "./components/ScrollLockOnLanding";
import SmoothScroll from "./components/SmoothScroll";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata = {
  title: "Jack Stolly",
  description: "Jack Stolly's portfolio site.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${inter.className}`}>
      <head>
        {/* Warm up the image host's DNS + TLS handshake well before the
            carousel / gallery / hero requests fire. */}
        <link rel="preconnect" href="https://picsum.photos" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://picsum.photos" />
      </head>
      <body>
        <ScrollLockOnLanding />
        <SmoothScroll />
        <BouncingBall fontFamily={inter.style.fontFamily} />
        {children}
        <Menu />
        <MobileMenu />
      </body>
    </html>
  );
}
