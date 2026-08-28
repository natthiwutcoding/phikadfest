import type { MetadataRoute } from "next";

import { CATEGORIES } from "@/lib/data/categories";
import { listEvents, listProvincesWithEvents } from "@/lib/events";
import { absoluteUrl } from "@/lib/site";

/**
 * sitemap.xml สร้างอัตโนมัติจากข้อมูลจริง
 *
 * รวมหน้าที่กรองแล้ว (ตามจังหวัด/หมวดหมู่) เข้าไปด้วย เพราะเป็นหน้าที่ตรงกับ
 * คำค้นที่คนใช้จริง เช่น "งานเทศกาลเชียงใหม่" — ถ้าไม่ใส่ Google อาจไม่เจอ
 *
 * ใส่เฉพาะจังหวัดที่มีงานอยู่จริง ไม่ใส่ทั้ง 77 จังหวัด เพราะหน้าว่างเปล่า
 * ถูกมองว่าเป็นเนื้อหาคุณภาพต่ำ และฉุด ranking ของทั้งเว็บ
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [events, provinces] = await Promise.all([listEvents(), listProvincesWithEvents()]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/events"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/map"), changeFrequency: "daily", priority: 0.7 },
    { url: absoluteUrl("/submit"), changeFrequency: "monthly", priority: 0.4 },
  ];

  const eventPages: MetadataRoute.Sitemap = events.map((event) => ({
    url: absoluteUrl(`/events/${event.slug}`),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const provincePages: MetadataRoute.Sitemap = provinces.map((province) => ({
    url: absoluteUrl(`/events?province=${province.slug}`),
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.map((category) => ({
    url: absoluteUrl(`/events?category=${category.slug}`),
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [...staticPages, ...eventPages, ...provincePages, ...categoryPages];
}
