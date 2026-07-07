import React from "react";
import "./FooterSection.css";

const FOOTER_LINKS = [
  "Privacy Policy",
  "AI Transparency Policy",
  "Pricing",
  "Terms & Conditions",
  "Blog",
  "Contact Us",
];

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.6" cy="6.7" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.9 4.7 12 4.7 12 4.7s-5.9 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.7.5 7.6.5 7.6.5s5.9 0 7.6-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 15.5v-7l6 3.5-6 3.5Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M13.5 21v-7.3h2.5l.4-3h-2.9V8.8c0-.9.3-1.5 1.6-1.5h1.5V4.6c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 4v2.2H8v3h2.5V21h3Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M17.7 3H21l-7.2 8.2L22.2 21H16l-4.9-6.4L5.5 21H2.2l7.7-8.8L2 3h6.4l4.5 6 4.8-6ZM16.6 19h1.8L7.4 4.9H5.5L16.6 19Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M6.3 8.3A1.8 1.8 0 1 0 6.3 4.7a1.8 1.8 0 0 0 0 3.6ZM4.8 9.8h3V19h-3V9.8Zm4.8 0h2.9V11h.1c.4-.8 1.4-1.6 2.9-1.6 3.1 0 3.7 2 3.7 4.7V19h-3v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2V19h-3V9.8Z" />
    </svg>
  );
}

function SocialIcon({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href="#"
      aria-label={label}
      className="footer-section__social"
    >
      {children}
    </a>
  );
}

export default function FooterSection() {
  return (
    <footer className="footer-section">
      <div className="footer-section__inner">
        <div className="footer-section__grid">
          <div>
            <div className="footer-section__brand">
              <div className="footer-section__brand-text">SearchE</div>
              <img
                src="/18Searcheo 2.svg"
                alt=""
                className="footer-section__brand-logo"
                loading="lazy"
              />
              <div className="footer-section__brand-text">AI</div>
            </div>

            <div className="footer-section__links">
              {FOOTER_LINKS.map((link) => (
                <a key={link} href="#" className="footer-section__link">
                  {link}
                </a>
              ))}
            </div>

            <button
              type="button"
              className="footer-section__demo-button"
            >
              Book Demo
            </button>
          </div>

          <div className="footer-section__right">
            <div className="footer-section__contact">
              <p>Call us: +1 (999) 999-99-99</p>
              <p>
                Email Us:{" "}
                <a href="mailto:info@searcheo.ai" className="footer-section__contact-link">
                  info@searcheo.ai
                </a>
              </p>
            </div>

            <div className="footer-section__socials">
              <SocialIcon label="Instagram">
                <InstagramIcon />
              </SocialIcon>
              <SocialIcon label="YouTube">
                <YouTubeIcon />
              </SocialIcon>
              <SocialIcon label="Facebook">
                <FacebookIcon />
              </SocialIcon>
              <SocialIcon label="X">
                <XIcon />
              </SocialIcon>
              <SocialIcon label="LinkedIn">
                <LinkedInIcon />
              </SocialIcon>
            </div>

            <div className="footer-section__newsletter">
              <h3 className="footer-section__newsletter-title">
                Stay ahead of AI search.
              </h3>

              <form className="footer-section__newsletter-form">
                <input
                  type="email"
                  placeholder="Your Email here"
                  className="footer-section__newsletter-input"
                />
                <button
                  type="button"
                  className="footer-section__newsletter-button"
                >
                  Subscribe
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="footer-section__copyright">
          Copyright 2026. All Rights Reserved. SearchEO AI
        </div>
      </div>
    </footer>
  );
}
