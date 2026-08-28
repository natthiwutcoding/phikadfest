import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // API เป็น endpoint ข้อมูล ไม่ใช่หน้าเว็บ ให้บอทข้ามไปเพื่อไม่เปลือง crawl budget
      disallow: ["/api/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
