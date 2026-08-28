import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventMap } from "@/components/event-map";
import {
  formatAddress,
  formatDateRange,
  formatPrice,
  formatRelativeDay,
  formatTimeRange,
} from "@/lib/format";
import { getEventBySlug } from "@/lib/events";
import { buildEventJsonLd } from "@/lib/structured-data";

export async function generateMetadata(props: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  // getEventBySlug ถูกห่อด้วย React.cache อยู่แล้ว การเรียกซ้ำใน page จึงไม่ query ใหม่
  const event = await getEventBySlug(slug);

  if (!event) return { title: "ไม่พบงานนี้" };

  const dateText = formatDateRange(event.startAt, event.endAt);
  const description = `${dateText} ที่ ${event.venueName ?? event.province.nameTh} จ.${event.province.nameTh} — ${event.description}`.slice(
    0,
    300,
  );

  return {
    title: event.title,
    description,
    alternates: { canonical: `/events/${event.slug}` },
    openGraph: {
      type: "article",
      title: event.title,
      description,
      url: `/events/${event.slug}`,
    },
  };
}

export default async function EventDetailPage(props: PageProps<"/events/[slug]">) {
  const { slug } = await props.params;
  const event = await getEventBySlug(slug);

  if (!event) notFound();

  const time = formatTimeRange(event.startAt, event.endAt, event.isAllDay);
  const relative = formatRelativeDay(event.startAt, event.endAt);

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      {/*
        JSON-LD ทำให้ Google แสดงผลการค้นหาแบบอีเวนต์ (มีวันที่/สถานที่ในหน้าผลค้นหา)
        ต้องอยู่ในหน้าที่ render ฝั่งเซิร์ฟเวอร์ บอทถึงจะเห็น
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildEventJsonLd(event)) }}
      />

      <nav className="text-sm text-muted">
        <Link href="/events" className="hover:text-foreground">
          ← กลับไปหน้าค้นหางาน
        </Link>
      </nav>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={`/events?category=${event.categorySlug}`}
            className="flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 hover:text-brand-400"
          >
            <span aria-hidden>{event.category.emoji}</span>
            {event.category.nameTh}
          </Link>
          {relative ? (
            <span className="rounded-full bg-brand-900/50 px-3 py-1 font-medium text-brand-200">
              {relative}
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          {event.title}
        </h1>
      </header>

      <dl className="mt-6 grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-muted">วันที่</dt>
          <dd className="mt-0.5">
            {formatDateRange(event.startAt, event.endAt)}
            {time ? <span className="block text-sm text-muted">{time}</span> : null}
            {event.isAllDay ? (
              <span className="block text-sm text-muted">ไม่ได้ระบุเวลาเริ่ม</span>
            ) : null}
          </dd>
        </div>

        <div>
          <dt className="text-sm font-medium text-muted">สถานที่</dt>
          <dd className="mt-0.5">
            {event.venueName ?? "—"}
            <span className="block text-sm text-muted">
              {formatAddress(event.address, event.province.nameTh)}
            </span>
          </dd>
        </div>

        <div>
          <dt className="text-sm font-medium text-muted">ค่าเข้า</dt>
          <dd className="mt-0.5">{formatPrice(event.isFree, event.priceMin, event.priceMax)}</dd>
        </div>

        {event.organizerName ? (
          <div>
            <dt className="text-sm font-medium text-muted">ผู้จัดงาน</dt>
            <dd className="mt-0.5">{event.organizerName}</dd>
          </div>
        ) : null}
      </dl>

      {event.ticketUrl ? (
        <a
          href={event.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="glow-brand mt-4 inline-block min-h-11 rounded-xl bg-brand-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-brand-700"
        >
          ดูรายละเอียดบัตร ↗
        </a>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-bold">รายละเอียด</h2>
        <p className="mt-2 leading-relaxed whitespace-pre-line">{event.description}</p>
      </section>

      {event.lat != null && event.lng != null ? (
        <section className="mt-8">
          <h2 className="text-lg font-bold">แผนที่</h2>
          <EventMap
            lat={event.lat}
            lng={event.lng}
            label={event.venueName ?? event.title}
          />
        </section>
      ) : null}

      <section className="mt-10 rounded-2xl border border-line bg-surface-muted p-5 text-sm">
        <p className="font-medium">ข้อมูลไม่ถูกต้อง หรืองานเลื่อน?</p>
        <p className="mt-1 text-muted">
          ข้อมูลอาจเปลี่ยนแปลงได้ แนะนำให้ตรวจสอบกับผู้จัดงานอีกครั้งก่อนเดินทาง
          {event.sourceUrl ? (
            <>
              {" "}
              <a
                href={event.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-400 underline-offset-4 hover:underline"
              >
                ดูแหล่งข้อมูลต้นทาง ↗
              </a>
            </>
          ) : null}
        </p>
      </section>
    </article>
  );
}
