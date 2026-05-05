import type { Metadata } from "next";
import "./globals.css";
import { MixpanelProvider } from "@/components/mixpanel-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

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
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/ecz5qed.css" />
      </head>
      <body className="min-h-screen bg-background antialiased font-sans">
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
