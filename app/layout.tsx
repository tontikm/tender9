import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  metadataBase: new URL("https://tender9.vercel.app"),
  title: {
    default: "Tender9: SA government tender monitoring",
    template: "%s | Tender9",
  },
  description:
    "Every open South African government tender in one place. Get matched to the ones your business can win, track deadlines, and fill in the official bid forms, free to start.",
  openGraph: {
    type: "website",
    siteName: "Tender9",
    title: "Tender9: SA government tender monitoring",
    description:
      "Every open South African government tender in one place. Get matched to the ones your business can win, track deadlines, and fill in the official bid forms.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tender9: SA government tender monitoring",
    description: "Every open South African government tender in one place, matched to your business.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
