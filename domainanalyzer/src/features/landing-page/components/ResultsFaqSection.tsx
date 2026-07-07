import React, { useState } from "react";
import "./ResultsFaqSection.css";

type FaqItem = {
  question: string;
  answer: string;
};

const FAQS: FaqItem[] = [
  {
    question: "How accurate is AI visibility tracking?",
    answer:
      "AI visibility tracking is designed to show how accurately your brand appears across monitored prompts, answers, and citation surfaces over time.",
  },
  {
    question: "How often are prompts refreshed and re-tested?",
    answer:
      "Prompts are refreshed and re-tested on a regular basis so you can keep up with changing model responses and shifting visibility patterns.",
  },
  {
    question: "How is SearchEO.AI different from other GEO tools?",
    answer:
      "SearchEO.AI is different from other GEO tools because it combines prompt monitoring, citation tracking, and competitive visibility into one workflow.",
  },
  {
    question: "How much manual review is required?",
    answer:
      "Manual review is minimal, since the platform is built to surface the most important visibility changes and opportunities automatically.",
  },
  {
    question: "How long until I see results?",
    answer:
      "You can start seeing results as soon as your prompts, categories, and tracked entities are set up and the first reporting cycle is completed.",
  },
  {
    question: "Does it work for B2B and B2C?",
    answer:
      "Yes, it works for both B2B and B2C teams that need to understand how their brand shows up in AI-driven discovery journeys.",
  },
  {
    question: "What does SearchEO.AI connect to?",
    answer:
      "SearchEO.AI connects to the prompt, citation, and reporting inputs that help teams measure visibility across modern AI search surfaces.",
  },
  {
    question: "Can I white-label it for clients?",
    answer:
      "Yes, you can white-label it for clients when you need a client-facing reporting experience that fits your agency workflow.",
  },
];

function PlusIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <span className="results-faq-section__icon">
      <span
        className={`results-faq-section__icon-vertical ${
          isOpen ? "results-faq-section__icon-vertical--open" : ""
        }`}
      />
      <span className="results-faq-section__icon-horizontal" />
    </span>
  );
}

function FaqRow({ question, answer }: FaqItem) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="results-faq-section__row">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="results-faq-section__trigger"
      >
        <span className="results-faq-section__question">{question}</span>
        <PlusIcon isOpen={isOpen} />
      </button>

      {isOpen ? (
        <div className="results-faq-section__answer-wrap">
          <p className="results-faq-section__answer">{answer}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function ResultsFaqSection() {
  return (
    <section className="results-faq-section">
      <div className="results-faq-section__inner">
        <div className="results-faq-section__heading">
          <h2 className="results-faq-section__title">Frequently Asked Questions</h2>
        </div>

        <div className="results-faq-section__list">
          {FAQS.map((faq) => (
            <FaqRow key={faq.question} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
}
