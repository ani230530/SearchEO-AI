import React from 'react';
import { useNavigate } from "react-router-dom";


const ProcessFlow = () => {
  const steps = [
    {
      number: '01',
      title: 'Domain Submission',
      description: 'Submit your website URL and configure analysis parameters including location, custom paths, and priority URLs.',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      )
    },
    {
      number: '02',
      title: 'Content Extraction',
      description: 'AI-powered web crawling extracts and analyzes your website content, understanding your brand voice and key themes.',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
      )
    },
    {
      number: '03',
      title: 'Keyword Discovery',
      description: 'Advanced semantic analysis discovers relevant keywords with volume, difficulty, and CPC data for strategic insights.',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="6"/>
          <circle cx="12" cy="12" r="2"/>
        </svg>
      )
    },
    {
      number: '04',
      title: 'Phrase Generation',
      description: 'Generate optimized search phrases using community insights from Reddit, intent classification, and relevance scoring.',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      )
    },
    {
      number: '05',
      title: 'AI Query Analysis',
      description: 'Test phrases against GPT-4o, Claude 3, and Gemini 1.5 to measure your brand\'s presence and ranking in AI responses.',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <path d="M9 9h6v6H9z"/>
        </svg>
      )
    },
    {
      number: '06',
      title: 'Comprehensive Reporting',
      description: 'Get detailed analytics, competitor insights, and actionable recommendations to optimize your AI visibility.',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18"/>
          <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
        </svg>
      )
    }
  ];
const navigate = useNavigate();
  return (
    <section className="py-24 md:py-40" style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
      background: '#f5f5f7'
    }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-20">
          <div style={{
            fontSize: '12px',
            fontWeight: '400',
            letterSpacing: '0.083em',
            textTransform: 'uppercase',
            color: '#86868b',
            marginBottom: '8px',
            opacity: '0.8'
          }}>
            Process
          </div>
          <h2 style={{ 
            fontSize: 'clamp(48px, 8vw, 112px)',
            fontWeight: '200',
            letterSpacing: '-0.003em',
            lineHeight: '1.05',
            color: '#1d1d1f',
            margin: '0 0 16px 0'
          }}>How It Works</h2>
          <p style={{ 
            fontSize: 'clamp(19px, 2.5vw, 28px)',
            fontWeight: '300',
            letterSpacing: '0.011em',
            color: '#86868b',
            lineHeight: '1.4',
            margin: '0',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>Our comprehensive 6-step analysis process provides deep insights into your brand's AI visibility and competitive positioning.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <div 
              key={index}
              className="relative group"
              style={{
                padding: '40px 32px',
                borderRadius: '20px',
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'saturate(180%) blur(20px)',
                WebkitBackdropFilter: 'saturate(180%) blur(20px)',
                border: '0.5px solid rgba(0, 0, 0, 0.1)',
                transition: 'all 0.3s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-8px)';
                e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div className="text-center">
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  margin: '0 auto 24px auto',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                >
                  {step.icon}
                </div>
                
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  letterSpacing: '0.05em',
                  color: '#007AFF',
                  marginBottom: '12px',
                  textTransform: 'uppercase'
                }}>
                  {step.number}
                </div>
                
                <h3 style={{
                  fontSize: '24px',
                  fontWeight: '400',
                  letterSpacing: '-0.022em',
                  color: '#1d1d1f',
                  margin: '0 0 16px 0',
                  lineHeight: '1.2'
                }}>
                  {step.title}
                </h3>
                
                <p style={{
                  fontSize: '17px',
                  fontWeight: '300',
                  letterSpacing: '0.011em',
                  color: '#86868b',
                  lineHeight: '1.4',
                  margin: '0'
                }}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-20">
          <button  onClick={() => navigate('/dashboard')}
          style={{
            height: '48px',
            padding: '0 32px',
            borderRadius: '980px',
            background: '#000000',
            color: '#ffffff',
            border: 'none',
            fontSize: '16px',
            fontWeight: '400',
            letterSpacing: '-0.022em',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)';
            e.currentTarget.style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#000000';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          >
            Start Your Analysis
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 16 16" 
              fill="none" 
              style={{ marginLeft: '8px' }}
            >
              <path 
                d="M6 12L10 8L6 4" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProcessFlow;
