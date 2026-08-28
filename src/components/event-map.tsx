/**
 * แผนที่แสดงตำแหน่งงาน
 *
 * ใช้ iframe ฝังจาก OpenStreetMap แทนการติดตั้ง Leaflet เพราะช่วง MVP
 * ต้องการแค่ "ปักหมุดหนึ่งจุดแล้วให้กดไปดูต่อได้" ซึ่งวิธีนี้ทำได้โดย
 *  - ไม่เพิ่ม dependency
 *  - ไม่ต้องส่ง JavaScript ไปฝั่ง client เลย
 *  - ไม่มีค่าใช้จ่ายต่อการโหลด (ต่างจาก Google Maps ที่คิดเงินตามจำนวนครั้ง)
 *
 * เมื่อไหร่ควรเปลี่ยนไปใช้ Leaflet: ตอนที่ต้องแสดงหลายหมุดพร้อมกัน
 * เช่น หน้าแผนที่รวมงานทั้งจังหวัด หรือต้องการ marker แบบกำหนดเอง
 */

/** กรอบพื้นที่รอบจุดหมาย — ประมาณ 2–3 กม. ในไทย ซึ่งพอเห็นถนนรอบๆ */
const BBOX_PADDING_DEG = 0.012;

export function EventMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const bbox = [
    lng - BBOX_PADDING_DEG,
    lat - BBOX_PADDING_DEG,
    lng + BBOX_PADDING_DEG,
    lat + BBOX_PADDING_DEG,
  ].join(",");

  const embedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const fullMapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <div className="mt-2">
      <iframe
        src={embedSrc}
        title={`แผนที่ตำแหน่งของ ${label}`}
        loading="lazy"
        className="aspect-video w-full rounded-2xl border border-line"
      />

      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-400 underline-offset-4 hover:underline"
        >
          นำทางด้วย Google Maps ↗
        </a>
        <a
          href={fullMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted underline-offset-4 hover:underline"
        >
          เปิดใน OpenStreetMap ↗
        </a>
      </div>
    </div>
  );
}
