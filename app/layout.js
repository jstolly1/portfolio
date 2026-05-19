import { Inter } from "next/font/google";
import BouncingBall from "./components/BouncingBall";
import Menu from "./components/Menu";
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
      <body>
        <BouncingBall fontFamily={inter.style.fontFamily} />
        {children}
        <Menu />
      </body>
    </html>
  );
}
