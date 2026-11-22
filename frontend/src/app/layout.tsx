import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ระบบปฏิทินกิจกรรมชั่วโมงทุน — สำหรับอาจารย์และนักศึกษา",
  description: "ระบบประกาศกิจกรรมและลงทะเบียนเก็บชั่วโมงทุนสำหรับนักศึกษาและอาจารย์",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
