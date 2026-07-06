export const metadata = {
  title: "Tender9",
  description: "SA government tender monitoring and response generation",
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
