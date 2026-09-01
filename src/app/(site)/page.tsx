import Link from "next/link";

import { EventCard } from "@/components/event-card";
import { HeroGlow } from "@/components/hero-glow";
import { NearbyEvents } from "@/components/nearby-events";
import { CATEGORIES } from "@/lib/data/categories";
import { countEventsByCategory, listEvents, listProvincesWithEvents } from "@/lib/events";
import { ACTIVE_PROVINCES, ACTIVE_REGION_LABEL } from "@/lib/region-scope";

export default async function HomePage() {
  const [upcoming, categoryCounts, provinces] = await Promise.all([
    listEvents({ limit: 6 }),
    countEventsByCategory(),
    listProvincesWithEvents(),
  ]);

  const activeCategories = CATEGORIES.filter((category) => categoryCounts.has(category.slug));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <section className="relative py-6 text-center sm:py-10">
        <HeroGlow />

        {/*
          ป้ายบอกขอบเขตพื้นที่วางไว้เหนือหัวข้อ — บอกตั้งแต่วินาทีแรกว่าเว็บนี้ครอบคลุมที่ไหน
          ผู้ใช้จะได้ไม่เสียเวลาค้นหางานในภาคที่เรายังไม่มีข้อมูล และเป็นคำที่ Google
          ใช้จัดหมวดหน้านี้ด้วย (คนค้น "งานเทศกาลภาคตะวันออก" จริง)
        */}
        <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted">
          <span aria-hidden>📍</span> {ACTIVE_REGION_LABEL}
        </p>

        <h1 className="mt-4 text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
          มีงานอะไรน่าไปบ้าง
          <span className="mt-1 block text-brand-400">ใกล้คุณตอนนี้</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted text-pretty">
          งานประจำปี คอนเสิร์ต เวิร์กช็อป คาร์มีท และอีกหลายอย่างใน{ACTIVE_REGION_LABEL}
          รวมไว้ที่เดียว ดูวันเวลาและสถานที่ได้ครบก่อนออกเดินทาง
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
          {ACTIVE_PROVINCES.map((province) => province.nameTh).join(" · ")}
        </p>
      </section>

      <div className="mt-4">
        <NearbyEvents />
      </div>

      <section aria-labelledby="categories-heading" className="mt-12">
        <h2 id="categories-heading" className="text-xl font-bold">
          เลือกตามความสนใจ
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {activeCategories.map((category) => (
            <li key={category.slug}>
              {/* min-h-11 (44px) เป็นความสูงขั้นต่ำที่กดง่ายด้วยนิ้วบนจอมือถือ */}
              <Link
                href={`/events?category=${category.slug}`}
                className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm transition-colors hover:border-brand-400"
              >
                <span aria-hidden>{category.emoji}</span>
                {category.nameTh}
                <span className="text-xs text-muted">{categoryCounts.get(category.slug)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="upcoming-heading" className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="upcoming-heading" className="text-xl font-bold">
            งานที่กำลังจะถึง
          </h2>
          <Link
            href="/events"
            className="text-sm font-medium text-brand-400 underline-offset-4 hover:underline"
          >
            ดูทั้งหมด →
          </Link>
        </div>

        {upcoming.length > 0 ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">
            ยังไม่มีงานในระบบ —{" "}
            <Link href="/submit" className="font-medium text-brand-400 hover:underline">
              ช่วยแจ้งงานที่คุณรู้จัก
            </Link>
          </p>
        )}
      </section>

      {provinces.length > 0 ? (
        <section aria-labelledby="provinces-heading" className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="provinces-heading" className="text-xl font-bold">
              จังหวัดที่มีงาน
            </h2>
            <Link
              href="/map"
              className="text-sm font-medium text-brand-400 underline-offset-4 hover:underline"
            >
              🗺️ ดูบนแผนที่ →
            </Link>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {provinces.map((province) => (
              <li key={province.slug}>
                <Link
                  href={`/events?province=${province.slug}`}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm transition-colors hover:border-brand-400"
                >
                  {province.nameTh}
                  <span className="text-xs text-muted">{province.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12 rounded-2xl border border-line bg-surface-muted p-6 text-center sm:p-8">
        <h2 className="text-lg font-bold">รู้จักงานที่ยังไม่มีในเว็บ?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted text-pretty">
          ส่งข้อมูลงานเข้ามาได้เลย ไม่มีค่าใช้จ่าย ทีมงานจะตรวจสอบก่อนเผยแพร่
          เพื่อให้ข้อมูลบนเว็บเชื่อถือได้
        </p>
        <Link
          href="/submit"
          className="glow-brand mt-4 inline-block min-h-11 rounded-xl bg-brand-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-brand-700"
        >
          แจ้งงานเข้าระบบ
        </Link>
      </section>
    </div>
  );
}
