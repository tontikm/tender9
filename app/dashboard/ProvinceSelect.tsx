"use client";

export function ProvinceSelect({
  current,
  options,
}: {
  current: string;
  options: { value: string; label: string; href: string }[];
}) {
  return (
    <select
      className="province-select"
      aria-label="Filter by province"
      value={current}
      onChange={(e) => {
        const opt = options.find((o) => o.value === e.target.value);
        if (opt) window.location.href = opt.href;
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
