import "@/styles/globals.css";
import "@/styles/fonts.css";

import { type Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Room 237",
  description: "I guess you can call it home for the winter",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {process.env.NODE_ENV === "development" && (
        <head>
          <script src="http://localhost:8097" async></script>
        </head>
      )}
      <body className="overflow-hidden overscroll-none">
        <div
          className="text-foreground h-full w-full rounded-3xl select-none"
          style={{
            backgroundImage: "url(/bg.png)",
            backgroundSize: "128px",
            backgroundRepeat: "repeat",
          }}
        >
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
