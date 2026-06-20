import { Menu } from "lucide-react";
import { Link, NavLink } from "react-router-dom";

import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Home", to: "/" },
  { label: "Blogs", to: "/blog" },
  { label: "Solutions", to: "/solutions" },
  { label: "Pricing", to: "/pricing" },
] as const;

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "text-sm font-medium tracking-[-0.01em] transition-colors duration-200",
    isActive ? "text-[#1D4ED8]" : "text-slate-700 hover:text-slate-950"
  );

const drawerLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex w-full items-center rounded-2xl px-4 py-3 text-base font-medium tracking-[-0.01em] transition-colors duration-200",
    isActive
      ? "bg-white/70 text-[#1D4ED8]"
      : "text-slate-700 hover:bg-white/60 hover:text-slate-950"
  );

export default function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 bg-[#F1F6FF] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center">
          <img
            src="/Searcheo-full-logo.svg"
            alt="SearchEO AI"
            className="h-9 w-auto sm:h-10"
          />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden flex-1 items-center justify-center gap-10 md:flex"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === "/"}
              className={navLinkClassName}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open navigation menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white/80 text-slate-700 shadow-sm transition-colors hover:bg-white hover:text-slate-950 md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>

            <SheetContent
              side="top"
              className="border-b border-slate-200/70 bg-[#F1F6FF] p-0 shadow-[0_20px_60px_rgba(15,23,42,0.14)]"
            >
              <div className="px-4 pb-6 pt-14 sm:px-6">
                <nav aria-label="Mobile primary" className="flex flex-col gap-1">
                  {navItems.map((item) => (
                    <SheetClose asChild key={item.label}>
                      <NavLink
                        to={item.to}
                        end={item.to === "/"}
                        className={drawerLinkClassName}
                      >
                        {item.label}
                      </NavLink>
                    </SheetClose>
                  ))}
                </nav>

                <div className="mt-5 border-t border-slate-200/70 pt-5 md:hidden">
                  <div className="flex flex-col gap-3">
                    <SheetClose asChild>
                      <Link
                        to="/auth"
                        className="rounded-full px-4 py-3 text-left text-base font-medium text-slate-700 transition-colors hover:bg-white/60 hover:text-slate-950"
                      >
                        Login
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        to="/audit"
                        className="rounded-full border border-slate-300 bg-white px-4 py-3 text-left text-base font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
                      >
                        Signup
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <button
                        type="button"
                        className="rounded-full bg-[#4C89C5] px-4 py-3 text-left text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#3d77b3]"
                        title="Coming soon"
                      >
                        Book Demo
                      </button>
                    </SheetClose>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <div className="hidden items-center gap-2 md:flex">
            <Link
              to="/auth"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
            >
              Login
            </Link>
            <Link
              to="/audit"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              Signup
            </Link>
            <button
              type="button"
              className="rounded-full bg-[#4C89C5] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3d77b3]"
              title="Coming soon"
            >
              Book Demo
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
