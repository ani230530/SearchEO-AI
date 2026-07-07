import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { heroData, aiPlatforms } from "../data";

import chatgptIcon from "../assets/chatgpt.svg";
import googleIcon from "../assets/google.svg";
import geminiIcon from "../assets/gemini.svg";
import anthropicIcon from "../assets/anthropic.svg";
import mistralIcon from "../assets/mistral.svg";
import perplexityIcon from "../assets/perplexity.svg";
import heroPoster from "../assets/hero-bg-poster.jpeg";
import rocketIcon from "../assets/material-symbols-light_rocket-outline.svg";

const iconMap: Record<string, string> = {
  ChatGPT: chatgptIcon,
  Google: googleIcon,
  Gemini: geminiIcon,
  Anthropic: anthropicIcon,
  Mistral: mistralIcon,
  Perplexity: perplexityIcon,
};

export default function HeroSection() {
  // Split title dynamically around "owning" to apply custom styles
  const parts = heroData.title.split(/(owning)/g);

  // Framer Motion Animation Variants
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: "easeOut",
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
  };

  return (
    <section className="relative w-full h-screen min-h-[600px] bg-brand-dark flex items-center justify-center overflow-hidden">
      {/* Background Video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        poster={heroPoster}
        className="absolute inset-0 w-full h-full object-cover z-0 opacity-70"
      >
        <source src="/landing-page/hero-bg.webm" type="video/webm" />
        <source src="/landing-page/hero-bg.mp4" type="video/mp4" />
      </video>

      {/* Dark Overlay */}
      <div
        className="absolute inset-0 z-[5] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(5, 7, 10, 0) 0%, #05070A 100%)",
        }}
      />

      {/* Layer 1: Content Container */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-5xl px-6 flex flex-col items-center text-center select-none"
      >
        {/* Title */}
        <motion.h1
          variants={itemVariants}
          className="text-[clamp(1.8rem,4.8vw,4.5rem)] font-extrabold tracking-tight text-brand-text max-w-none leading-[1.15] sm:leading-[1.1] mb-6 sm:whitespace-nowrap"
        >
          {parts.map((part, index) =>
            part === "owning" ? (
              <span
                key={index}
                className="text-brand-purple"
              >
                {part}
              </span>
            ) : (
              part
            )
          )}
        </motion.h1>

        {/* Subtitle / Description & AI Icon Strip Inline Container */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col lg:flex-row items-center justify-center gap-4 lg:gap-6 mb-12 w-full max-w-none text-brand-muted select-none"
        >
          <p className="text-base sm:text-lg lg:text-xl font-light whitespace-nowrap">
            {heroData.subtitle}
          </p>

          <div className="flex items-center gap-3 sm:gap-4">
            {aiPlatforms.map((platform) => {
              const iconSrc = iconMap[platform.name] || platform.icon;
              return (
                <div
                  key={platform.id}
                  title={platform.name}
                  className="w-10 h-10 sm:w-11 sm:h-11 lg:w-12 lg:h-12 flex items-center justify-center bg-white/5 backdrop-blur-md border border-white/10 rounded-xl transition hover:bg-white/10 hover:border-white/20 hover:scale-105 duration-200"
                >
                  <img
                    src={iconSrc}
                    alt={`${platform.name} icon`}
                    className="w-6 h-6 sm:w-6.5 sm:h-6.5 lg:w-7 lg:h-7 object-contain"
                  />
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Buttons / Actions */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
        >
          <Link
            to="/audit"
            className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-[#4BB8FD] to-[#9E30FF] hover:brightness-110 text-white font-semibold rounded-2xl transition duration-300 shadow-[0_4px_20px_rgba(158,48,255,0.3)] text-center flex items-center justify-center gap-2.5"
          >
            <img
              src={rocketIcon}
              alt="Rocket icon"
              className="w-6 h-6 object-contain"
            />
            <span>{heroData.ctaPrimary}</span>
          </Link>
          <button
            type="button"
            className="demo-btn-gradient w-full sm:w-auto px-8 py-4 text-brand-text font-semibold rounded-2xl transition duration-300 hover:bg-white/5"
          >
            <span>{heroData.ctaSecondary}</span>
          </button>
        </motion.div>
      </motion.div>
    </section>
  );
}
