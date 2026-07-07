import React from "react";
import "./LandingPage.css";
import Header from "./components/Header";
import HeroSection from "./components/HeroSection";
import StatsCounter from "./components/StatsCounter";
import LeadForm from "./components/LeadForm";
import ScrollCarouselSection from "./components/ScrollCarouselSection";
import ShiftFramesSection from "./components/ShiftFramesSection";
import FoundationSection from "./components/FoundationSection";
import TrustAndStatsSection from "./components/TrustAndStatsSection";
import ArticlesSection from "./components/ArticlesSection";
import ResultsGridSection from "./components/ResultsGridSection";
import ResultsFaqSection from "./components/ResultsFaqSection";
import ContactSection from "./components/ContactSection";
import FooterSection from "./components/FooterSection";

export default function LandingPage() {
  return (
    <div className="landing-page-root">
      <Header />

      <div className="landing-page-ambient landing-page-ambient-left" />
      <div className="landing-page-ambient landing-page-ambient-right" />

      <HeroSection />
      <StatsCounter />
      <LeadForm />
      <ScrollCarouselSection />
      <ShiftFramesSection />
      <FoundationSection />
      <TrustAndStatsSection />
      <ArticlesSection />
      <ResultsGridSection />
      <ResultsFaqSection />
      <ContactSection />
      <FooterSection />
    </div>
  );
}
