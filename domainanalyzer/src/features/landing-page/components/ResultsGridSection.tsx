import React from "react";
import "./ResultsGridSection.css";

type QuoteCard = {
  type: "quote";
  quote: string;
  name: string;
  role: string;
  avatar: string;
};

type ImageCard = {
  type: "image";
  name: string;
  role: string;
  image: string;
};

type GridCard = QuoteCard | ImageCard;

const GRID_CARDS: GridCard[] = [
  {
    type: "quote",
    quote:
      '"The prompt discovery experience made the opportunity feel much more tangible. Instead of treating AI visibility as a broad concept, we could see the specific conversations our brand needed to be part of."',
    name: "Marco Leoni",
    role: "Marketing Leader, B2B Technology Company",
    avatar: "/image-man.png",
  },
  {
    type: "image",
    name: "Marco Leoni",
    role: "SEO Analyst",
    image: "/image-man.png",
  },
  {
    type: "quote",
    quote:
      '"SearchEO helped us uncover questions and comparison moments we had not built content around yet. The workflow felt practical, not overwhelming."',
    name: "Marco Leoni",
    role: "Content Strategist, Professional Services Firm",
    avatar: "/image-group.png",
  },
  {
    type: "image",
    name: "Marco Leoni",
    role: "SEO Analyst",
    image: "/image-man.png",
  },
  {
    type: "image",
    name: "Marco Leoni",
    role: "SEO Analyst",
    image: "/image-group.png",
  },
  {
    type: "quote",
    quote:
      '"The report gave us a clear snapshot of how our brand appears across relevant conversations. It was one of the first times this new search landscape felt easy to explain internally."',
    name: "Marco Leoni",
    role: "Digital Marketing Manager, Agency",
    avatar: "/image-man.png",
  },
  {
    type: "image",
    name: "Marco Leoni",
    role: "SEO Analyst",
    image: "/image-lady.png",
  },
  {
    type: "quote",
    quote:
      '"The platform did not stop at showing an opportunity, rather it helped turn the insights into a guided content direction."',
    name: "Marco Leoni",
    role: "Director of Marketing, Financial Services Company",
    avatar: "/image-lady.png",
  },
  {
    type: "quote",
    quote:
      '"What stood out was how quickly we could move from a broad category to the prompts that actually matter for our audience. It gave us a more focused way to think about visibility."',
    name: "Marco Leoni",
    role: "Growth Lead, SaaS Company",
    avatar: "/image-group.png",
  },
  {
    type: "image",
    name: "Marco Leoni",
    role: "SEO Analyst",
    image: "/image-lady.png",
  },
  {
    type: "quote",
    quote:
      '"We liked that the report did not just show where we appeared. It highlighted where we were absent, who was showing up instead, and what those gaps could mean."',
    name: "Marco Leoni",
    role: "Founder, Consumer Brand",
    avatar: "/image-man.png",
  },
  {
    type: "image",
    name: "Marco Leoni",
    role: "SEO Analyst",
    image: "/image-lady.png",
  },
];

function QuoteCardView({ quote, name, role, avatar }: QuoteCard) {
  return (
    <article className="results-grid-section__quote-card">
      <p className="results-grid-section__quote">{quote}</p>
      <div className="results-grid-section__quote-meta">
        <img src={avatar} alt="" className="results-grid-section__avatar" loading="lazy" />
        <div>
          <div className="results-grid-section__person-name">{name}</div>
          <div className="results-grid-section__person-role">{role}</div>
        </div>
      </div>
    </article>
  );
}

function ImageCardView({ name, role, image }: ImageCard) {
  return (
    <article className="results-grid-section__image-card">
      <img src={image} alt="" className="results-grid-section__image" loading="lazy" />
      <div className="results-grid-section__image-overlay" />
      <div className="results-grid-section__image-meta">
        <div className="results-grid-section__image-name">{name}</div>
        <div className="results-grid-section__image-role">{role}</div>
      </div>
    </article>
  );
}

export default function ResultsGridSection() {
  return (
    <section className="results-grid-section">
      <div className="results-grid-section__inner">
        <div className="results-grid-section__heading">
          <h2 className="results-grid-section__title">Real Results, Real Brands</h2>
          <p className="results-grid-section__subtitle">Turning visibility questions into confident action.</p>
        </div>
      </div>

      <div className="results-grid-section__grid">
        {GRID_CARDS.map((card, index) =>
          card.type === "quote" ? (
            <QuoteCardView key={`quote-${index}`} {...card} />
          ) : (
            <ImageCardView key={`image-${index}`} {...card} />
          ),
        )}
      </div>
    </section>
  );
}
