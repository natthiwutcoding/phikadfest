import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import { SampleDataBanner } from "@/components/sample-data-banner";
import { SITE, SITE_URL } from "@/lib/site";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // metadataBase ทำให้ Next แปลง path สัมพัทธ์ใน openGraph เป็น URL เต็มให้อัตโนมัติ
  // ถ้าไม่ตั้ง OG image จะไม่ขึ้นตอนแชร์ลิงก์ใน LINE/Facebook
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  // ธีมเดียว (dark) จึงมีสีเดียว ไม่ต้องแยกตาม prefers-color-scheme
  themeColor: "#120d0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${notoSansThai.variable} h-full`}>
      {/*
        min-h-0 บน main จำเป็นเพื่อให้ลูกที่ใช้ h-full คำนวณความสูงได้ถูก
        (ค่าตั้งต้นของ flex item คือ min-height: auto ซึ่งทำให้ยืดตามเนื้อหาแทน)
        หน้า /map พึ่งตรงนี้เพื่อให้แผนที่เต็มพื้นที่ที่เหลือพอดี ไม่ล้นจนเกิด scroll
      */}
      <body className="flex h-full flex-col font-sans antialiased">
        <SampleDataBanner />
        <SiteHeader />
        <main className="min-h-0 flex-1">{children}</main>
      </body>
    </html>
  );
}
