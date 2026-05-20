import "./globals.css";

export const metadata = {
  title: "Emirates ID Scanner",
  description: "Scan the back of an Emirates ID and auto-fill the details",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
