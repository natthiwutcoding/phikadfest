import { SiteFooter } from "@/components/site-footer";

/**
 * Layout ของหน้าเว็บทั่วไป — เพิ่ม footer ต่อท้ายเนื้อหา
 *
 * (site) เป็น route group ของ Next.js วงเล็บทำให้ชื่อโฟลเดอร์ไม่ปรากฏใน URL
 * เช่น src/app/(site)/events/page.tsx ยังเป็น /events เหมือนเดิม
 *
 * แยกไว้แบบนี้เพราะหน้า /map เป็นแผนที่เต็มจอที่ไม่ควรมีอะไรต่อท้ายด้านล่างเลย
 * จึงวางไว้นอก group นี้ (src/app/map/) เพื่อไม่ให้ได้ footer ติดไปด้วย
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
