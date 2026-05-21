import React from "react";
import { useNavigate } from "react-router-dom";
import FloatingElementsDemo from "../components/TrustedBy";
import FooterSection from "../components/ui/footer";
import Testimonials from "../components/Testimonials";
import FeaturesSection from "../components/Features";
import ProcessFlow from "../components/ProcessFlow";
import AIModels from "../components/AIModels";

function LandingPage() {
  const navigate = useNavigate();

  return (
    <section className="minimal-root">
      {/* Fixed Background Layer */}
      <div className="background-layer">
        {/* Accent Lines */}
        <div className="accent-lines">
          <div className="hline" />
          <div className="hline" />
          <div className="hline" />
          <div className="vline" />
          <div className="vline" />
          <div className="vline" />
        </div>
      </div>

      {/* Content Layer */}
      <div className="content-layer">
      <style>{`
/* Inter is loaded once via <link> in index.html — no duplicate CSS @import.
   The CSS-level @import is a render-blocking sequential fetch, while the
   <link> in the document head parallelizes with the rest of the page. */

.minimal-root, .minimal-root * {
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

.minimal-root {
  position: relative;
  min-height: 100vh;
  width: 100vw;
  overflow-x: hidden;

  --bg: #ffffff;
  --fg: #1d1d1f;
  --muted: #86868b;
  --border: #d2d2d7;
  --accent: #f5f5f7;

  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-weight: 300;
  line-height: 1.5;
}

/* Fixed background elements */
.background-layer {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 0;
}

/* Content layer */
.content-layer {
  position: relative;
  z-index: 10;
}

/* header */
.header {
  position: fixed;
  top: 0; left: 0; right: 0;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
  z-index: 100;
}
.brand {
  font-size: 17px;
  font-weight: 400;
  letter-spacing: -0.022em;
  color: var(--fg);
  text-decoration: none;
  transition: opacity 0.2s ease;
}
.brand:hover {
  opacity: 0.7;
}
.cta {
  height: 36px;
  padding: 0 20px;
  border-radius: 980px;
  background: var(--fg);
  color: var(--bg);
  border: none;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: -0.022em;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cta:hover { 
  background: #424245; 
  transform: scale(1.02);
}

/* hero center */
.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 120px 24px 80px 24px;
}
.kicker {
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.083em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
  opacity: 0.8;
}
.title {
  font-weight: 200;
  font-size: clamp(48px, 8vw, 112px);
  line-height: 1.05;
  letter-spacing: -0.003em;
  margin: 0 0 16px 0;
  color: var(--fg);
  text-shadow: none;
}
.subtitle {
  margin-top: 0;
  font-size: clamp(19px, 2.5vw, 28px);
  font-weight: 300;
  letter-spacing: 0.011em;
  color: var(--muted);
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.4;
}

/* accent lines container */
.accent-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* base line visuals */
.hline, .vline {
  position: absolute;
  background: var(--border);
  opacity: .75;
  will-change: transform, opacity;
}

/* horizontal lines */
.hline {
  height: 1px; left: 0; right: 0;
  transform: scaleX(0);
  transform-origin: 50% 50%;
  animation: drawX 800ms cubic-bezier(.22,.61,.36,1) forwards;
}
.hline:nth-child(1){ top: 20%; animation-delay: 150ms; }
.hline:nth-child(2){ top: 50%; animation-delay: 280ms; }
.hline:nth-child(3){ top: 80%; animation-delay: 410ms; }

/* vertical lines */
.vline {
  width: 1px; top: 0; bottom: 0;
  transform: scaleY(0);
  transform-origin: 50% 0%;
  animation: drawY 900ms cubic-bezier(.22,.61,.36,1) forwards;
}
.vline:nth-child(4){ left: 20%; animation-delay: 520ms; }
.vline:nth-child(5){ left: 50%; animation-delay: 640ms; }
.vline:nth-child(6){ left: 80%; animation-delay: 760ms; }

/* subtle gradient shimmer while drawing */
.hline::after, .vline::after{
  content:"";
  position:absolute;
  inset:0;
  background: linear-gradient(90deg, transparent, rgba(250,250,250,.25), transparent);
  opacity:0;
  animation: shimmer 900ms ease-out forwards;
}
.hline:nth-child(1)::after{ animation-delay: 150ms; }
.hline:nth-child(2)::after{ animation-delay: 280ms; }
.hline:nth-child(3)::after{ animation-delay: 410ms; }
.vline:nth-child(4)::after{ animation-delay: 520ms; }
.vline:nth-child(5)::after{ animation-delay: 640ms; }
.vline:nth-child(6)::after{ animation-delay: 760ms; }

/* keyframes */
@keyframes drawX {
  0% { transform: scaleX(0); opacity: 0; }
  60% { opacity: .9; }
  100% { transform: scaleX(1); opacity: .75; }
}
@keyframes drawY {
  0% { transform: scaleY(0); opacity: 0; }
  60% { opacity: .9; }
  100% { transform: scaleY(1); opacity: .75; }
}
@keyframes shimmer {
  0% { opacity: .0; }
  30% { opacity: .25; }
  100% { opacity: 0; }
}


/* trusted section */
.trusted-section {
  padding: 80px 24px 120px 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
  background: var(--accent);
}

/* testimonials section */
.testimonials-section {
  padding: 120px 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--bg);
}

.testimonials-container {
  max-width: 1200px;
  width: 100%;
  text-align: center;
}

.testimonials-title {
  font-size: clamp(40px, 4vw, 64px);
  font-weight: 200;
  color: var(--fg);
  margin-bottom: 80px;
  letter-spacing: -0.003em;
  line-height: 1.1;
}

/* hide background elements behind footer */
footer {
  position: relative;
  z-index: 20;
  background: var(--bg);
}

/* subtle background gradient overlay */
.trusted-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.02) 0%, transparent 70%);
  pointer-events: none;
  z-index: 1;
}

/* floating elements styles */
.floating-element {
  will-change: transform;
  position: relative;
  z-index: 2;
}

/* ensure proper text styling for the title */
.trusted-section h2 {
  color: var(--fg);
  font-weight: 300;
  margin-bottom: 0;
  font-size: clamp(32px, 4vw, 56px);
  letter-spacing: -0.003em;
  text-align: center;
  opacity: 0.9;
  position: relative;
  z-index: 2;
  line-height: 1.1;
}

/* ensure proper styling for floating elements in dark theme */
.trusted-section .text-5xl {
  color: var(--fg);
}

/* enhanced logo styling */
.trusted-section .relative {
  backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  position: relative;
  overflow: hidden;
  min-height: 144px;
  min-width: 144px;
}

/* ensure logo backgrounds are visible with consistent black color */
.trusted-section .logo-bg-1,
.trusted-section .logo-bg-2,
.trusted-section .logo-bg-3,
.trusted-section .logo-bg-4,
.trusted-section .logo-bg-5,
.trusted-section .logo-bg-6,
.trusted-section .logo-bg-7 {
  background-color: #000000 !important;
  border: 2px solid #000000 !important;
}

/* special white background for Blue Ocean Global Technology logo */
.trusted-section .logo-bg-8 {
  background-color: #ffffff !important;
  border: 2px solid #e5e7eb !important;
}

/* fallback styling for logo containers */
.trusted-section a {
  border: none !important;
}

/* ensure images are visible */
.trusted-section img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: none;
}

/* subtle inner glow effect */
.trusted-section .relative::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.05) 0%, transparent 50%);
  opacity: 0;
  transition: opacity 0.3s ease;
  border-radius: inherit;
}

.trusted-section .relative:hover::before {
  opacity: 1;
}

.trusted-section .relative:hover {
  transform: translateY(-8px) scale(1.08);
  border-color: rgba(0, 0, 0, 0.15);
  box-shadow: 
    0 20px 40px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

/* improved grid spacing with staggered animation */
.trusted-section .grid {
  gap: 2.5rem;
}

/* staggered animation for logos */
.trusted-section .floating-element:nth-child(1) { animation-delay: 0.1s; }
.trusted-section .floating-element:nth-child(2) { animation-delay: 0.2s; }
.trusted-section .floating-element:nth-child(3) { animation-delay: 0.3s; }
.trusted-section .floating-element:nth-child(4) { animation-delay: 0.4s; }
.trusted-section .floating-element:nth-child(5) { animation-delay: 0.5s; }
.trusted-section .floating-element:nth-child(6) { animation-delay: 0.6s; }
.trusted-section .floating-element:nth-child(7) { animation-delay: 0.7s; }

/* subtle pulse animation */
@keyframes subtlePulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}

.trusted-section .relative {
  animation: subtlePulse 4s ease-in-out infinite;
}

/* responsive adjustments */
@media (max-width: 768px) {
  .hero {
    padding: 100px 20px 60px 20px;
  }
  
  .trusted-section {
    padding: 60px 20px 80px 20px;
  }
  
  .testimonials-section {
    padding: 80px 20px;
  }
  
  .header {
    padding: 12px 20px;
  }
  
  .brand {
    font-size: 16px;
  }
  
  .cta {
    height: 32px;
    padding: 0 16px;
    font-size: 13px;
    min-width: 100px;
  }
}

@media (max-width: 480px) {
  .hero {
    padding: 80px 16px 40px 16px;
  }
  
  .trusted-section {
    padding: 40px 16px 60px 16px;
  }
  
  .testimonials-section {
    padding: 60px 16px;
  }
  
  .header {
    padding: 10px 16px;
  }
  
  .brand {
    font-size: 15px;
  }
  
  .cta {
    height: 30px;
    padding: 0 14px;
    font-size: 12px;
    min-width: 90px;
  }
}

/* high contrast mode support */
@media (prefers-contrast: high) {
  .trusted-section .relative {
    border-color: rgba(0, 0, 0, 0.3);
  }
  
  .trusted-section h2 {
    opacity: 1;
  }
}

/* reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .trusted-section .relative {
    animation: none;
    transition: none;
  }
  
  .trusted-section .relative:hover {
    transform: none;
  }
  
  .floating-element {
    animation: none;
  }
}

/* footer section (copy) */
.content {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  padding: 32px 24px;
  border-top: 1px solid var(--border);
  display: grid;
  place-items: center;
  text-align: center;
  gap: 6px;
}
.content .tag {
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.content .heading {
  font-size: 22px;
  font-weight: 600;
  color: var(--fg);
}
.content .desc {
  font-size: 14px;
  color: var(--muted);
  max-width: 680px;
}
      `}</style>

        {/* Header */}
        <header className="header">
            <a className="brand" href="#" target="_blank" rel="noopener noreferrer">
              AI Brand Analyzer
            </a>
          <button className="cta" type="button" onClick={() => navigate('/auth')}>
            login/signup
          </button>
        </header>

        {/* Hero */}
        <main className="hero">
          <div>
            <div className="kicker">AI-Powered Brand Intelligence</div>
            <h1 className="title">Discover how AI sees<br/>your brand online</h1>
            <p className="subtitle">Analyze your domain's visibility across AI models, discover competitor insights, and optimize your brand's presence in AI-driven search results.</p>
            <div style={{ marginTop: '48px' }}>
              <button
                type="button"
                onClick={() => navigate('/audit')}
                style={{ 
                  background: 'var(--fg)', 
                  color: 'var(--bg)', 
                  border: 'none',
                  borderRadius: '980px',
                  padding: '12px 24px',
                  fontSize: '17px',
                  fontWeight: '400',
                  letterSpacing: '-0.022em',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: '140px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#424245';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--fg)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                Get Started
              </button>
            </div>
          </div>
        </main>

        {/* Trusted by section */}
        <section className="trusted-section">
          <FloatingElementsDemo />
        </section>

        {/* Features section */}
        <FeaturesSection />

        {/* Process Flow section */}
        <ProcessFlow />

        {/* AI Models section */}
        <AIModels />

        {/* Testimonials section */}
        <section className="testimonials-section">
          <div className="testimonials-container">
            <h2 className="testimonials-title">What our customers say</h2>
            <Testimonials />
          </div>
        </section>

        {/* Additional sections can be added here */}
        
      </div>

      {/* Footer */}
      <FooterSection />
    </section>
  )
}

export default LandingPage
