import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MixpanelProvider } from "@/components/mixpanel-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Klira",
    template: "%s | Klira",
  },
  description: "Team capacity planning and committed work visibility.",
  icons: {
    icon: [{ url: "/Klira-favicon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} min-h-screen bg-background antialiased font-sans`}>
        <MixpanelProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </MixpanelProvider>
      </body>
    </html>
  );
}
