import { Loader2 } from "lucide-react";

export default function EmbedLoading() {
  return (
    <div className="flex justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
}
