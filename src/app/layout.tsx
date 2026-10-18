import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NUTM Learn LMS Backend API",
  description: "Enterprise Learning Management System for Nigerian University of Technology and Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
