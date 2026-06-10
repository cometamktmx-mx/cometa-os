type StrategyCardProps = {
  title: string;
  items: string[];
  color: "green" | "red" | "blue" | "purple";
};

export default function StrategyCard({
  title,
  items,
  color,
}: StrategyCardProps) {
  const colors = {
    green: {
      badge: "bg-green-50 text-green-700 border-green-200",
    },
    red: {
      badge: "bg-red-50 text-red-700 border-red-200",
    },
    blue: {
      badge: "bg-blue-50 text-blue-700 border-blue-200",
    },
    purple: {
      badge: "bg-purple-50 text-purple-700 border-purple-200",
    },
  };

  return (
    <div
      className="
      bg-white
      border
      border-slate-200
      rounded-3xl
      p-8
      shadow-sm
      transition-all
      duration-300
      hover:shadow-2xl
hover:-translate-y-2
hover:scale-[1.01]
      "
    >
      <div
        className={`
        inline-flex
        px-5
        py-2
        rounded-full
        text-sm
        font-semibold
        border
        mb-6
        ${colors[color].badge}
        `}
      >
        {title}
      </div>

      <div className="space-y-6">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex gap-4 text-slate-700 leading-8"
          >
            <span className="font-bold text-slate-900">
              {index + 1}.
            </span>

            <p>{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}