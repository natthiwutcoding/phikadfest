import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminEventForm } from "@/components/admin/event-form";
import { STATUS_LABELS, toSelectableStatus } from "@/lib/admin-event-validation";
import { toAdminEventFormValues } from "@/lib/admin-event-form-values";
import { requireAdmin } from "@/lib/auth";
import { getAdminEvent } from "@/lib/events";
import { formatDateRange } from "@/lib/format";

export const metadata: Metadata = {
  title: "แก้ไขงาน",
  robots: { index: false, follow: false },
};

export default async function EditAdminEventPage(props: PageProps<"/admin/events/[id]">) {
  await requireAdmin();

  const { id } = await props.params;
  const event = await getAdminEvent(id);

  if (!event) notFound();

  const status = toSelectableStatus(event.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <nav className="text-sm text-muted">
        <Link href="/admin" className="hover:text-foreground">
          ← กลับไปหน้าจัดการงาน
        </Link>
      </nav>

      <h1 className="mt-4 text-2xl font-bold tracking-tight">แก้ไขงาน</h1>
      <p className="mt-1 text-sm text-muted">
        {formatDateRange(event.startAt, event.endAt)} · {event.province.nameTh}
        {status ? ` · สถานะปัจจุบัน: ${STATUS_LABELS[status]}` : null}
      </p>

      {/*
        แสดง slug ให้เห็นแต่แก้ไม่ได้ — เป็นที่อยู่ถาวรของงานที่ลิงก์ซึ่งถูกแชร์ไปแล้ว
        และอันดับใน Google ผูกอยู่ การเปลี่ยนชื่องานจึงไม่กระทบ URL โดยตั้งใจ
      */}
      <p className="mt-2 truncate rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-muted">
        /events/{event.slug}
      </p>

      <AdminEventForm mode="edit" defaultValues={toAdminEventFormValues(event)} />
    </div>
  );
}
