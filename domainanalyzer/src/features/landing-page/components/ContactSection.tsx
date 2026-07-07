import React from "react";
import "./ContactSection.css";

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6.27 6.27l1.28-1.28a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}

function FormField({
  label,
  placeholder,
  className = "",
  multiline = false,
}: {
  label: string;
  placeholder: string;
  className?: string;
  multiline?: boolean;
}) {
  return (
    <label className={`contact-section__field ${className}`}>
      <span className="contact-section__field-label">{label}</span>
      {multiline ? (
        <textarea
          placeholder={placeholder}
          rows={5}
          className="contact-section__field-textarea"
        />
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          className="contact-section__field-input"
        />
      )}
    </label>
  );
}

export default function ContactSection() {
  return (
    <section className="contact-section">
      <div className="contact-section__inner">
        <div className="contact-section__heading">
          <h2 className="contact-section__title">Own your AI visibility.</h2>
          <p className="contact-section__subtitle">
            Drop in one domain and get an instant baseline across the AI search ecosystem. We'll show you exactly where
            you stand and the first gap to close.
          </p>
        </div>

        <div className="contact-section__content">
          <div className="contact-section__info-panel">
            <h3 className="contact-section__info-title">Contact our team</h3>

            <div className="contact-section__info-list">
              <div className="contact-section__info-row">
                <PhoneIcon />
                <span className="contact-section__info-text">+1 (999) 999-99-99</span>
              </div>
              <div className="contact-section__info-row">
                <MailIcon />
                <a href="mailto:info@searcheo.ai" className="contact-section__info-link">
                  info@searcheo.ai
                </a>
              </div>
            </div>

            <div className="contact-section__image-wrap">
              <img src="/office-bg.png" alt="" className="contact-section__image" loading="lazy" />
            </div>
          </div>

          <form className="contact-section__form">
            <div className="contact-section__form-grid">
              <FormField label="First Name" placeholder="Enter First Name" />
              <FormField label="Last Name" placeholder="Enter Last Name" />
            </div>

            <FormField label="Email" placeholder="Enter your email" />
            <FormField label="Mobile No." placeholder="Enter your mobile no" />
            <FormField label="Message" placeholder="Type message" multiline />

            <button
              type="button"
              className="contact-section__button"
            >
              Start free monitoring
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
