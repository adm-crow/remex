export function AuroraBg() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="aurora-blob-1 animate-aurora-1 absolute rounded-full blur-[120px] opacity-50 dark:opacity-35"
        style={{ width: 640, height: 640, top: "-20%", left: "-12%" }}
      />
      <div
        className="aurora-blob-2 animate-aurora-2 absolute rounded-full blur-[100px] opacity-40 dark:opacity-30"
        style={{ width: 520, height: 520, top: "5%", right: "-8%" }}
      />
      <div
        className="aurora-blob-3 animate-aurora-3 absolute rounded-full blur-[110px] opacity-35 dark:opacity-25"
        style={{ width: 580, height: 580, bottom: "-12%", left: "18%" }}
      />
      <div
        className="aurora-blob-4 animate-aurora-4 absolute rounded-full blur-[90px] opacity-40 dark:opacity-30"
        style={{ width: 460, height: 460, bottom: "5%", right: "8%" }}
      />
    </div>
  );
}
