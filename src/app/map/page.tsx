import type { Metadata } from "next";

import { MapControls } from "@/components/map/map-controls";
import { ProvinceSearch } from "@/components/map/province-search";
import { ProvincePanel } from "@/components/map/province-panel";
import { ThailandMap } from "@/components/map/thailand-map";
import { getProvince } from "@/lib/data/provinces";
import { parseDateRange, resolveDateRange } from "@/lib/date-range";
import { getProvinceEventSummary, listEvents } from "@/lib/events";

const PANEL_EVENT_LIMIT = 5;

export const metadata: Metadata = {
  title: "แผนที่งานทั่วไทย",
  description:
    "ดูว่าจังหวัดไหนมีงานเทศกาลหรือกิจกรรมกำลังจะจัดบ้าง กดที่จังหวัดบนแผนที่เพื่อดูรายละเอียด",
  alternates: { canonical: "/map" },
};

function one(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() || undefined;
}

export default async function MapPage(props: PageProps<"/map">) {
  const params = await props.searchParams;

  const range = parseDateRange(one(params.range));
  const provinceSlug = one(params.province);
  const province = provinceSlug ? getProvince(provinceSlug) : undefined;

  const dateRange = resolveDateRange(range);

  // ดึงพร้อมกัน: สรุปรายจังหวัดสำหรับระบายสีแผนที่ + งานของจังหวัดที่เลือกสำหรับแผงข้าง
  const [summary, provinceEvents] = await Promise.all([
    getProvinceEventSummary(dateRange),
    province
      ? listEvents({ ...dateRange, provinceSlug: province.slug })
      : Promise.resolve([]),
  ]);

  /** ฟิลเตอร์ปัจจุบันโดยไม่รวมจังหวัด — ใช้ตอนเปลี่ยนจังหวัดหรือปิดแผง */
  const baseParams = new URLSearchParams();
  if (range !== "all") baseParams.set("range", range);

  /** ส่งต่อไปหน้าค้นหาละเอียด พร้อมช่วงวันที่ที่เลือกไว้ เพื่อไม่ให้ผู้ใช้ต้องตั้งค่าซ้ำ */
  const searchParams = new URLSearchParams();
  if (province) searchParams.set("province", province.slug);
  if (dateRange.from) searchParams.set("from", dateRange.from);
  if (dateRange.to) searchParams.set("to", dateRange.to);

  return (
    /*
      แผนที่เต็มพื้นที่ที่เหลือจาก header ไม่มีอะไรต่อท้ายด้านล่างเลย
      หน้านี้อยู่นอก route group (site) จึงไม่มี footer ติดมาด้วย

      h-full ทำงานได้เพราะ <main> ในไฟล์ layout.tsx ตั้ง flex-1 กับ min-h-0 ไว้แล้ว
    */
    <section
      aria-label="แผนที่งานทั่วประเทศ"
      className="relative h-full w-full overflow-hidden bg-surface"
    >
      {/* h1 ซ่อนจากสายตาแต่ยังอยู่ให้ screen reader และบอทอ่าน เพราะหน้านี้ไม่มีที่ว่างให้หัวข้อ */}
      <h1 className="sr-only">แผนที่งานเทศกาลและกิจกรรมทั่วไทย</h1>

      <ThailandMap
        summary={summary}
        selectedCode={province?.code}
        baseParams={baseParams.toString()}
      />

      {/* กลุ่มควบคุมมุมบนซ้าย — ค้นหาจังหวัดสำหรับคนที่รู้อยู่แล้วว่าจะไปไหน แล้วตามด้วยตัวกรอง */}
      <div className="pointer-events-none absolute top-3 left-3 z-20 flex w-64 flex-col gap-2 sm:w-72">
        <ProvinceSearch baseParams={baseParams.toString()} />
        <MapControls range={range} province={province?.slug} />
      </div>

      <ProvincePanel
        province={province}
        events={provinceEvents.slice(0, PANEL_EVENT_LIMIT)}
        totalCount={provinceEvents.length}
        baseParams={baseParams.toString()}
        searchParams={searchParams.toString()}
      />
    </section>
  );
}
