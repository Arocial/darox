import type { Metadata, Viewport } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Darox",
  description: "Darox Chatbot UI",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <TooltipProvider>
          <div className="app-frame">
            <div className="min-h-0 flex-1">{children}</div>
          </div>
          <Toaster position="top-left" richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
