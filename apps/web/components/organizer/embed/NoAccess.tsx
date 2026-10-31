import Link from "next/link";

export default function NoAccess() {
  return (
    <div className="max-w-lg mx-auto mt-16 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-8 text-center font-jakarta">
      <h1 className="text-lg font-bold text-gray-900 dark:text-white">You don't have access to the website widget</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
        Ask an owner, admin or manager on your team to give you access, or to share the widget code with you.
      </p>
      <Link href="/organizer" className="inline-flex mt-5 min-h-[44px] items-center px-4 rounded-[10px] border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
        Back to home
      </Link>
    </div>
  );
}
