import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/app/(site)/login/actions";
import { reviewEvent } from "@/app/admin/actions";
import {
  STATUS_LABELS,
  STATUS_OPTIONS,
  toSelectableStatus,
  type SelectableStatus,
} from "@/lib/admin-event-validation";
import { requireAdmin } from "@/lib/auth";
import { countAdminEventsByStatus, listAdminEvents } from "@/lib/events";
import { formatDateRange, formatTimeRange } from "@/lib/format";
import { readParam } from "@/lib/search-params";
import type { AdminEvent, EventStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "จัดการงาน",
  robots: { index: false, follow: false },
};

/** 'all' คือดูทุกสถานะ ส่วนที่เหลือคือกรองทีละสถานะ */
type StatusFilter = SelectableStatus | "all";

const STATUS_BADGES: Record<SelectableStatus, string> = {
  draft: "border-line bg-surface-muted text-muted",
  pending: "border-amber-900 bg-amber-950/50 text-amber-100",
  approved: "border-emerald-900 bg-emerald-950/50 text-emerald-100",
  rejected: "border-red-900 bg-red-950/50 text-red-100",
};

/**
 * อ่านตัวกรองจาก URL
 *
 * ค่าตั้งต้นคือ 'pending' เพราะงานที่รอตรวจคือสิ่งที่ต้องลงมือทำ ส่วนงานที่เผยแพร่แล้ว
 * เปิดดูเมื่อจะแก้เท่านั้น — เปิดหน้ามาแล้วเห็นคิวงานค้างทันทีจึงตรงกับการใช้จริงมากกว่า
 */
function readStatusFilter(value: string | undefined): StatusFilter {
  if (value === "all") return "all";
  return toSelectableStatus(value) ?? "pending";
}

function StatusTab({
  filter,
  current,
  label,
  count,
}: {
  filter: StatusFilter;
  current: StatusFilter;
  label: string;
  count: number;
}) {
  const active = filter === current;

  return (
    <Link
      href={filter === "pending" ? "/admin" : `/admin?status=${filter}`}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors ${
        active
          ? "border-brand-500 bg-brand-600 font-medium text-white"
          : "border-line bg-surface hover:border-brand-400"
      }`}
    >
      {label}
      <span className={active ? "text-xs text-white/70" : "text-xs text-muted"}>{count}</span>
    </Link>
  );
}

function EventRow({ event }: { event: AdminEvent }) {
  const status = toSelectableStatus(event.status);
  const time = formatTimeRange(event.startAt, event.endAt, event.isAllDay);

  return (
    <li className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{event.title}</h2>
            {status ? (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_BADGES[status]}`}
              >
                {STATUS_LABELS[status]}
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-muted">
            {formatDateRange(event.startAt, event.endAt)}
            {time ? ` · ${time}` : null}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {event.category.emoji} {event.category.nameTh} ·{" "}
            {[event.venueName, event.province.nameTh].filter(Boolean).join(" · ")}
            {event.lat == null ? " · ไม่มีพิกัด" : null}
          </p>

          {event.organizerContact ? (
            <p className="mt-0.5 text-xs text-muted">ติดต่อผู้จัด: {event.organizerContact}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/admin/events/${event.id}`}
            className="flex min-h-11 items-center rounded-xl border border-line px-4 text-sm transition-colors hover:border-brand-400"
          >
            แก้ไข
          </Link>

          {event.status === "approved" ? (
            <Link
              href={`/events/${event.slug}`}
              target="_blank"
              className="flex min-h-11 items-center text-sm text-brand-400 underline-offset-4 hover:underline"
            >
              ดูหน้าจริง ↗
            </Link>
          ) : null}
        </div>
      </div>

      {event.sourceUrl ? (
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-brand-400 underline-offset-4 hover:underline"
        >
          ดูแหล่งข้อมูลต้นทาง ↗
        </a>
      ) : null}

      {/* ปุ่มเปลี่ยนสถานะเร็ว — ซ่อนปุ่มที่ตรงกับสถานะปัจจุบัน เพราะกดแล้วไม่มีอะไรเกิดขึ้น */}
      <div className="mt-4 flex flex-wrap gap-2">
        {event.status !== "approved" ? (
          <form action={reviewEvent}>
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="decision" value="approved" />
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              อนุมัติ
            </button>
          </form>
        ) : null}

        {event.status !== "rejected" ? (
          <form action={reviewEvent}>
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="decision" value="rejected" />
            <button
              type="submit"
              className="min-h-11 rounded-xl border border-line px-5 text-sm transition-colors hover:border-red-700 hover:text-red-300"
            >
              {event.status === "approved" ? "ถอนออกจากเว็บ" : "ปฏิเสธ"}
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

export default async function AdminPage(props: PageProps<"/admin">) {
  // เด้งออกทันทีถ้าไม่ใช่แอดมิน — ต้องเรียกก่อนแตะข้อมูลใดๆ
  const session = await requireAdmin();

  const params = await props.searchParams;
  const filter = readStatusFilter(readParam(params.status));

  const [events, counts] = await Promise.all([
    listAdminEvents(filter === "all" ? undefined : filter),
    countAdminEventsByStatus(),
  ]);

  const totalCount = (Object.values(counts) as number[]).reduce((sum, n) => sum + n, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">จัดการงาน</h1>
          <p className="mt-1 text-sm text-muted">เข้าสู่ระบบเป็น {session.email ?? "แอดมิน"}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/events/new"
            className="glow-brand flex min-h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            + เพิ่มงานใหม่
          </Link>

          <form action={logout}>
            <button
              type="submit"
              className="min-h-11 rounded-xl border border-line px-4 text-sm transition-colors hover:border-brand-400"
            >
              ออกจากระบบ
            </button>
          </form>
        </div>
      </header>

      <nav aria-label="กรองตามสถานะ" className="mt-5 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((status) => (
          <StatusTab
            key={status}
            filter={status}
            current={filter}
            label={STATUS_LABELS[status]}
            count={counts[status as EventStatus] ?? 0}
          />
        ))}
        <StatusTab filter="all" current={filter} label="ทั้งหมด" count={totalCount} />
      </nav>

      {events.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-10 text-center text-muted">
          {filter === "pending" ? "ไม่มีงานรอตรวจสอบ" : "ยังไม่มีงานในสถานะนี้"}
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ul>
      )}

      <p className="mt-8 text-sm text-muted">
        <Link href="/" className="text-brand-400 underline-offset-4 hover:underline">
          ← กลับหน้าเว็บ
        </Link>
      </p>
    </div>
  );
}
