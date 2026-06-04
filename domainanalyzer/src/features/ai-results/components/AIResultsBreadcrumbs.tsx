import { Link } from 'react-router-dom';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

type AIResultsBreadcrumbsProps = {
  mode?: 'history' | 'static';
  prefixLabel?: string;
  prefixHref?: string;
  pageLabel?: string;
  pageHref?: string;
  previousLabel?: string | null;
  currentLabel?: string | null;
  className?: string;
};

export function AIResultsBreadcrumbs({
  mode = 'history',
  prefixLabel = 'AI Results',
  prefixHref,
  pageLabel,
  pageHref,
  previousLabel,
  currentLabel,
  className,
}: AIResultsBreadcrumbsProps) {
  const items = mode === 'static'
    ? [
        { key: 'prefix', label: prefixLabel, href: prefixHref, active: false },
        pageLabel ? { key: 'page', label: pageLabel, href: pageHref, active: false } : null,
        currentLabel ? { key: 'current', label: currentLabel, active: true } : null,
      ]
    : [
        { key: 'prefix', label: prefixLabel, href: prefixHref, active: false },
        previousLabel ? { key: 'previous', label: previousLabel, faded: true } : null,
        currentLabel ? { key: 'current', label: currentLabel, active: true } : null,
      ];

  const visibleItems = items.filter(Boolean) as Array<
    | { key: string; label: string; href?: string; active?: boolean; faded?: boolean }
  >;

  return (
    <Breadcrumb className={cn('w-full overflow-hidden', className)}>
      <BreadcrumbList className="flex-nowrap gap-1 overflow-x-auto text-[13px] text-slate-500">
        {visibleItems.map((item, index) => (
          <span key={item.key} className="contents">
            {index > 0 ? <BreadcrumbSeparator className="text-slate-300" /> : null}
            <BreadcrumbItem className="shrink-0">
              {item.active ? (
                <BreadcrumbPage className="max-w-[10rem] truncate font-semibold text-[#2D4059] opacity-100 sm:max-w-none">
                  {item.label}
                </BreadcrumbPage>
              ) : item.href ? (
                <BreadcrumbLink asChild>
                  <Link
                    to={item.href}
                    className={cn(
                      'max-w-[10rem] truncate transition-colors hover:text-[#2D4059] sm:max-w-none',
                      item.faded ? 'opacity-50' : 'text-slate-500'
                    )}
                  >
                    {item.label}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <span
                  className={cn(
                    'max-w-[10rem] truncate sm:max-w-none',
                    item.active ? 'font-semibold text-[#2D4059] opacity-100' : item.faded ? 'opacity-50 text-slate-500' : 'text-slate-500'
                  )}
                >
                  {item.label}
                </span>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
