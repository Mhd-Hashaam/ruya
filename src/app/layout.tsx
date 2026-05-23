import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruya",
  description: "Personal media hub",
  icons: {
    icon: "/logos/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="isDashboard" suppressHydrationWarning={true}>
        {children}
      </body>
    </html>
  );
}
