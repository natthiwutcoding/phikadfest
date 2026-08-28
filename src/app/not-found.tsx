import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="text-4xl" aria-hidden>
        🔍
      </p>
      <h1 className="mt-4 text-2xl font-bold">ไม่พบหน้าที่ต้องการ</h1>
      <p className="mt-2 text-muted text-pretty">
        งานนี้อาจถูกลบ เปลี่ยนลิงก์ หรือจัดไปแล้ว ลองค้นหางานอื่นที่กำลังจะจัดดู
      </p>
      <Link
        href="/events"
        className="glow-brand mt-6 inline-block min-h-11 rounded-xl bg-brand-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-brand-700"
      >
        ดูงานทั้งหมด
      </Link>
    </div>
  );
}
