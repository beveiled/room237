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
      <body className="select-none">{children}</body>
    </html>
  );
}
