import React from "react";
import FAQItem from "./FAQItem";
import { faqData } from "../data";

export default function FAQSection() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
      {/* Title */}
      <div className="lg:col-span-1 space-y-4">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Frequently Asked Questions
        </h2>
        <p className="text-base text-brand-muted">
          Got questions about Search Engine Optimization for AI? We've got answers.
        </p>
      </div>

      {/* Accordion List */}
      <div className="lg:col-span-2 border-t border-white/5 divide-y divide-white/5">
        {faqData.map((faq, index) => (
          <FAQItem
            key={index}
            question={faq.question}
            answer={faq.answer}
          />
        ))}
      </div>
    </div>
  );
}
