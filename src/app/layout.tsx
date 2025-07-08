import "@/styles/globals.css";
import "@/styles/fonts.css";
import "react-image-crop/dist/ReactCrop.css";

import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Room 237",
  description: "I guess you can call it home for the winter",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="overflow-y-hidden overscroll-none">
        <div className="bg-background/50 text-foreground h-full w-full rounded-3xl backdrop-blur-xl select-none">
          {children}
        </div>
      </body>
    </html>
  );
}
