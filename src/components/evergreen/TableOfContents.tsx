"use client";

interface TOCItem {
  id: string;
  label: string;
}

interface TableOfContentsProps {
  items: TOCItem[];
}

export default function TableOfContents({ items }: TableOfContentsProps) {
  return (
    <nav
      aria-label="On this page"
      className="flex flex-wrap gap-2 text-sm"
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:border-purple-300 hover:text-purple-700 transition-colors"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
