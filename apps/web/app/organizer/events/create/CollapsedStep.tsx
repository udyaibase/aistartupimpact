import { Check, ChevronRight } from "lucide-react";

export default function CollapsedStep({
  num, label, desc, status, onClick,
}: {
  num: number; label: string; desc: string; status: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left">
      <div className="flex items-center gap-3">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          status === "complete"
            ? "bg-green-500 text-white"
            : "bg-gray-100 dark:bg-gray-800 text-gray-500"
        }`}>
          {status === "complete" ? <Check className="w-3.5 h-3.5" /> : num}
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">{label}</p>
          <p className="text-xs text-gray-400 font-jakarta">{desc}</p>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400" />
    </button>
  );
}
