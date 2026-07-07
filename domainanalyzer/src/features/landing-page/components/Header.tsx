import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Phone, Menu, X } from "lucide-react";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="absolute top-6 left-0 right-0 z-50 flex justify-center px-14 sm:px-16">
      <div className="w-full h-20 px-6 sm:px-9 bg-white/[0.03] rounded-2xl border border-white/[0.06] shadow-[0px_0px_12px_rgba(0,0,0,0.19)] backdrop-blur-[12px] flex justify-between items-center relative">

        {/* Logo */}
        <div className="flex items-center cursor-pointer select-none">
          <img
            src="/landing-page/Searcheo.png"
            alt="SearchEO Logo"
            className="w-40 h-8 sm:w-52 sm:h-10 object-contain"
          />
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex justify-start items-center gap-8 lg:gap-10">
          <a href="#platform" className="text-center text-white/80 hover:text-white text-sm lg:text-base font-semibold transition duration-200">Platform</a>
          <a href="#how-it-works" className="text-center text-white/80 hover:text-white text-sm lg:text-base font-semibold transition duration-200">How it works</a>
          <a href="#why-us" className="text-center text-white/80 hover:text-white text-sm lg:text-base font-semibold transition duration-200">Why us</a>
          <Link to="/blogs" className="text-center text-white/80 hover:text-white text-sm lg:text-base font-semibold transition duration-200">Blogs</Link>
          <a href="#pricing" className="text-center text-white/80 hover:text-white text-sm lg:text-base font-semibold transition duration-200">Pricing</a>
        </nav>

        {/* Desktop Action Buttons */}
        <div className="hidden md:flex justify-start items-center gap-3">
          {/* Login Button */}
          <Link
            to="/login"
            className="login-btn-gradient-border px-4 py-2.5 rounded-lg bg-white/5 text-white hover:bg-white/10 text-base font-semibold transition duration-200 shadow-[0px_1px_2px_rgba(16,24,40,0.05)] shadow-[inset_0px_4px_4px_rgba(0,0,0,0.25)] flex justify-center items-center"
          >
            Login
          </Link>

          {/* Call Us Button */}
          <button
            type="button"
            className="px-4 py-2.5 bg-gradient-to-l from-purple-600 to-sky-400 hover:brightness-110 text-white rounded-lg text-base font-semibold transition duration-200 shadow-[0px_1px_2px_rgba(16,24,40,0.05)] flex justify-center items-center gap-1.5"
          >
            <Phone className="w-4 h-4 text-white" />
            Call Us
          </button>
        </div>

        {/* Mobile Hamburger Toggle */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex md:hidden text-white hover:text-white/80 focus:outline-none transition duration-200"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="absolute top-[90px] left-0 right-0 bg-brand-dark/95 border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl backdrop-blur-lg md:hidden z-50">
            <a
              href="#platform"
              onClick={() => setMobileMenuOpen(false)}
              className="text-white hover:text-brand-purple text-base font-semibold transition py-1"
            >
              Platform
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="text-white hover:text-brand-purple text-base font-semibold transition py-1"
            >
              How it works
            </a>
            <a
              href="#why-us"
              onClick={() => setMobileMenuOpen(false)}
              className="text-white hover:text-brand-purple text-base font-semibold transition py-1"
            >
              Why us
            </a>
            <Link
              to="/blogs"
              onClick={() => setMobileMenuOpen(false)}
              className="text-white hover:text-brand-purple text-base font-semibold transition py-1"
            >
              Blogs
            </Link>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="text-white hover:text-brand-purple text-base font-semibold transition py-1"
            >
              Pricing
            </a>

            <div className="h-px bg-white/10 my-2" />

            <div className="flex flex-col gap-3">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="login-btn-gradient-border w-full py-2.5 rounded-lg bg-white/5 text-white text-base font-semibold shadow-[0px_1px_2px_rgba(16,24,40,0.05)] text-center block"
              >
                Login
              </Link>
              <button
                type="button"
                className="w-full py-2.5 bg-gradient-to-l from-purple-600 to-sky-400 text-white rounded-lg text-base font-semibold flex items-center justify-center gap-1.5"
              >
                <Phone className="w-4 h-4 text-white" />
                Call Us
              </button>
            </div>
          </div>
        )}

      </div>
    </header>
  );
}
