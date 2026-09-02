"use client";

import Link from "next/link";

/**
 * แจ้งผลสำเร็จหลังส่งข้อมูลงาน
 *
 * ── ทำไมใช้ <dialog> ไม่เขียน modal เอง ──
 * element นี้ให้ focus trap, ปิดด้วย Escape, backdrop และ aria-modal มาครบในตัว
 * การเขียนเองมีแต่จะได้ของที่เข้าถึงได้แย่กว่าและโค้ดยาวกว่าโดยไม่ได้อะไรเพิ่ม
 *
 * ── ทำไมต้องเป็น popup ไม่ใช่แถบข้อความเหนือฟอร์ม ──
 * ฟอร์มนี้ยาวเกินหนึ่งหน้าจอ ผู้ใช้กดปุ่มส่งตอนอยู่ล่างสุด แถบข้อความด้านบนจึงอยู่นอกสายตา
 * และการส่งงานสำเร็จเป็นจุดจบของภารกิจ ควรหยุดผู้ใช้ให้อ่านแล้วเลือกว่าจะไปไหนต่อ
 */
export function SubmitSuccessDialog({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <dialog
      /*
        เปิดด้วย ref callback ไม่ใช่ useEffect — ทำงานตอน element เข้า DOM พอดี
        เช็ค !el.open ก่อนเสมอ เพราะ showModal() จะ throw ถ้าเรียกตอนเปิดอยู่แล้ว
      */
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      /*
        onCancel = ผู้ใช้กด Escape (event นี้ยิงก่อน close เสมอ)
        ไม่พึ่ง onClose เพียงอย่างเดียวเพราะทดสอบแล้วพบว่าไม่ถูกเรียกในทุกเส้นทาง
        ปุ่มด้านล่างจึงเรียก onClose เองตรงๆ แทนการอาศัย <form method="dialog">
      */
      onCancel={onClose}
      aria-labelledby="submit-success-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-6 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col items-center text-center">
        <span
          aria-hidden
          className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-3xl"
        >
          ✅
        </span>

        <h2 id="submit-success-title" className="mt-4 text-xl font-bold">
          ส่งข้อมูลงานเรียบร้อยแล้ว
        </h2>

        {/*
          บอกขั้นตอนถัดไปให้ชัด — จุดนี้สำคัญที่สุดของกล่องนี้
          งานไม่ขึ้นเว็บทันทีเพราะต้องผ่านคิวตรวจ ถ้าไม่บอก ผู้ใช้จะคิดว่าระบบพังแล้วส่งซ้ำ
        */}
        <p className="mt-2 text-sm text-muted text-pretty">{message}</p>
      </div>

      {/*
        ให้ทางเลือกถัดไปที่ชัดเจน แทนที่จะปล่อยให้ผู้ใช้เดาเองว่าต้องทำอะไรต่อ

        ⚠️ ใช้ <div> ไม่ใช่ <form method="dialog">
        กล่องนี้ถูก render ใกล้กับฟอร์มแจ้งงาน การมี form ซ้อนกันเป็นสิ่งที่ HTML ไม่อนุญาต
        และทำให้ปุ่มในกล่องไปกดส่งฟอร์มใหญ่แทน — เรียก onClose เองตรงๆ ควบคุมได้แน่นอนกว่า
      */}
      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onClose}
          className="glow-brand min-h-11 rounded-xl bg-brand-600 px-5 font-medium text-white transition-colors hover:bg-brand-700"
        >
          แจ้งงานอีกงาน
        </button>

        <Link
          href="/events"
          className="flex min-h-11 items-center justify-center rounded-xl border border-line px-5 text-sm transition-colors hover:bg-surface-muted"
        >
          ดูงานทั้งหมด
        </Link>
      </div>
    </dialog>
  );
}
