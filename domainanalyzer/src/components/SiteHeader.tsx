import { Link, NavLink } from "react-router-dom";

type NavItem = {
  label: string;
  to?: string;
  end?: boolean;
};

const navItems: NavItem[] = [
  { label: "Home", to: "/", end: true },
  { label: "Blogs", to: "/blogs" },
  { label: "Solutions" },
  { label: "Pricing" },
];

export function SiteHeader() {
  return (
    <header className="header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="SearchEO AI home">
          <img className="brand-logo" src="/Searcheo-full-logo.svg" alt="SearchEO AI" />
        </Link>

        <nav className="header-nav" aria-label="Primary">
          {navItems.map((item) =>
            item.to ? (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `header-link${isActive ? " header-link--active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ) : (
              <span key={item.label} className="header-link">
                {item.label}
              </span>
            )
          )}
        </nav>

        <div className="header-actions">
          <Link className="header-login" to="/auth">
            Login
          </Link>
          <Link className="header-signup" to="/signup">
            Signup
          </Link>
          <Link className="header-book-demo" to="/audit">
            Book Demo
          </Link>
        </div>
      </div>
    </header>
  );
}
