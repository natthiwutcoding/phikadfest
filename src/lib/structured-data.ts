import { absoluteUrl } from "@/lib/site";
import type { EventWithRelations } from "@/lib/types";

/**
 * สร้าง JSON-LD ตามมาตรฐาน schema.org/Event
 *
 * ทำไมต้องมี: Google ใช้ข้อมูลนี้แสดงผลการค้นหาแบบพิเศษสำหรับอีเวนต์
 * (โชว์วันที่และสถานที่ในหน้าผลค้นหาเลย) ซึ่งได้พื้นที่มากกว่าและคนคลิกมากกว่า
 * ผลลัพธ์ธรรมดา — คุ้มมากสำหรับเว็บที่โตด้วย organic search
 *
 * ตรวจผลได้ที่ https://search.google.com/test/rich-results
 */
export function buildEventJsonLd(event: EventWithRelations) {
  const location: Record<string, unknown> = {
    "@type": "Place",
    name: event.venueName ?? event.province.nameTh,
    address: {
      "@type": "PostalAddress",
      streetAddress: event.address,
      addressLocality: event.district,
      addressRegion: event.province.nameTh,
      addressCountry: "TH",
    },
  };

  if (event.lat != null && event.lng != null) {
    location.geo = {
      "@type": "GeoCoordinates",
      latitude: event.lat,
      longitude: event.lng,
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description,
    startDate: event.startAt,
    endDate: event.endAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: absoluteUrl(`/events/${event.slug}`),
    location,
    ...(event.organizerName
      ? { organizer: { "@type": "Organization", name: event.organizerName } }
      : {}),
    offers: {
      "@type": "Offer",
      price: event.isFree ? 0 : (event.priceMin ?? 0),
      priceCurrency: "THB",
      availability: "https://schema.org/InStock",
      url: event.ticketUrl ?? absoluteUrl(`/events/${event.slug}`),
    },
  };
}
