/**
 * พื้นหลัง hero แบบแสงไฟ/โคมไฟลอยยามค่ำคืน — CSS ล้วน ไม่ใช้รูปภาพ
 *
 * ใช้ position: absolute วางไว้หลังเนื้อหา hero (ต้อง parent มี position: relative)
 * aria-hidden เพราะเป็นแค่ตกแต่ง ไม่มีข้อมูล
 */
export function HeroGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute top-[-20%] left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-brand-600/25 blur-3xl" />
      <div className="absolute top-10 left-[10%] h-40 w-40 rounded-full bg-amber-400/20 blur-2xl" />
      <div className="absolute top-24 right-[12%] h-56 w-56 rounded-full bg-rose-500/15 blur-3xl" />
      <div className="absolute top-0 right-[25%] h-24 w-24 rounded-full bg-brand-300/25 blur-xl" />
    </div>
  );
}
