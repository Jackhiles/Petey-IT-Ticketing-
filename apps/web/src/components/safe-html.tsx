import { sanitizeHtml } from "@petey/core";
import { cn } from "./ui";

/**
 * Renders stored ticket HTML. It was sanitized before storage; sanitizing again on render
 * means a bad row (an old import, a manual edit) still can't run script in the browser.
 */
export function SafeHtml({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn(
        "break-words text-sm leading-relaxed [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-zinc-100 [&_pre]:p-2 dark:[&_pre]:bg-zinc-800 [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}
