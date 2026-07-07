export function Features() {
    const videoUrl =
        import.meta.env.VITE_FEATURES_VIDEO_URL ||
        "https://res.cloudinary.com/ta2uztdv/video/upload/v1783195911/Browser_Tool-_6-compressed_1_1_ws3z2v.mp4";

    return (
        <section className="overflow-hidden py-24 md:py-40" style={{ 
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
            background: '#f5f5f7'
        }}>
            <div className="mx-auto max-w-6xl space-y-16 px-6 md:space-y-20">
                <div className="relative z-10 max-w-3xl mx-auto text-center">
                    <h2 style={{ 
                        fontSize: 'clamp(40px, 5vw, 72px)',
                        fontWeight: '200',
                        letterSpacing: '-0.003em',
                        lineHeight: '1.1',
                        color: '#1d1d1f',
                        margin: '0 0 24px 0'
                    }}>Comprehensive AI Brand Analysis</h2>
                    <p style={{ 
                        fontSize: 'clamp(19px, 2.5vw, 28px)',
                        fontWeight: '300',
                        letterSpacing: '0.011em',
                        color: '#86868b',
                        lineHeight: '1.4',
                        margin: '0'
                    }}>From domain extraction to competitive intelligence, our 6-step analysis process provides deep insights into how AI models perceive and rank your brand across multiple platforms.</p>
                </div>
                <div className="relative -mx-4 rounded-3xl p-3 md:-mx-12 lg:col-span-3">
                    <div className="[perspective:800px]">
                        <div className="[transform:skewY(-2deg)skewX(-2deg)rotateX(6deg)]">
                            <div className="aspect-[88/36] relative">
                                <div className="[background-image:radial-gradient(var(--tw-gradient-stops,at_75%_25%))] to-background z-1 -inset-[4.25rem] absolute from-transparent to-75%"></div>
                                {/* preload=metadata defers the 1.4 MB body
                                    download until the autoplay actually
                                    starts (and lets the browser skip the
                                    download entirely if the user navigates
                                    away before the section comes into
                                    view). */}
                                <video
                                    className="absolute inset-0 z-10 w-full h-full object-cover rounded-2xl"
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                    preload="metadata"
                                    disablePictureInPicture
                                    controlsList="nodownload noplaybackrate noremoteplayback"
                                >
                                    <source src={videoUrl} type="video/mp4" />
                                    <source src="/features2.mp4" type="video/mp4" />
                                    Your browser does not support the video tag.
                                </video>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="relative mx-auto grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
                    <div style={{ textAlign: 'center', padding: '24px' }}>
                        <div style={{ 
                            width: '48px', 
                            height: '48px', 
                            margin: '0 auto 16px auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
                            borderRadius: '12px'
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8"/>
                                <path d="m21 21-4.35-4.35"/>
                            </svg>
                        </div>
                        <h3 style={{ 
                            fontSize: '21px',
                            fontWeight: '400',
                            letterSpacing: '-0.022em',
                            color: '#1d1d1f',
                            margin: '0 0 8px 0'
                        }}>Domain Analysis</h3>
                        <p style={{ 
                            fontSize: '17px',
                            fontWeight: '300',
                            letterSpacing: '0.011em',
                            color: '#86868b',
                            lineHeight: '1.4',
                            margin: '0'
                        }}>Extract and analyze your website content to understand your brand's digital footprint.</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '24px' }}>
                        <div style={{ 
                            width: '48px', 
                            height: '48px', 
                            margin: '0 auto 16px auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #FF9500 0%, #FF6B35 100%)',
                            borderRadius: '12px'
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <circle cx="12" cy="12" r="6"/>
                                <circle cx="12" cy="12" r="2"/>
                            </svg>
                        </div>
                        <h3 style={{ 
                            fontSize: '21px',
                            fontWeight: '400',
                            letterSpacing: '-0.022em',
                            color: '#1d1d1f',
                            margin: '0 0 8px 0'
                        }}>Keyword Discovery</h3>
                        <p style={{ 
                            fontSize: '17px',
                            fontWeight: '300',
                            letterSpacing: '0.011em',
                            color: '#86868b',
                            lineHeight: '1.4',
                            margin: '0'
                        }}>AI-powered keyword research with volume, difficulty, and CPC data for strategic insights.</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '24px' }}>
                        <div style={{ 
                            width: '48px', 
                            height: '48px', 
                            margin: '0 auto 16px auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #34C759 0%, #30D158 100%)',
                            borderRadius: '12px'
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <path d="M9 9h6v6H9z"/>
                            </svg>
                        </div>
                        <h3 style={{ 
                            fontSize: '21px',
                            fontWeight: '400',
                            letterSpacing: '-0.022em',
                            color: '#1d1d1f',
                            margin: '0 0 8px 0'
                        }}>Multi-Model Testing</h3>
                        <p style={{ 
                            fontSize: '17px',
                            fontWeight: '300',
                            letterSpacing: '0.011em',
                            color: '#86868b',
                            lineHeight: '1.4',
                            margin: '0'
                        }}>Test your phrases against GPT-4o, Claude 3, and Gemini 1.5 for comprehensive coverage.</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '24px' }}>
                        <div style={{ 
                            width: '48px', 
                            height: '48px', 
                            margin: '0 auto 16px auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #FF3B30 0%, #FF6B6B 100%)',
                            borderRadius: '12px'
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 3v18h18"/>
                                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
                            </svg>
                        </div>
                        <h3 style={{ 
                            fontSize: '21px',
                            fontWeight: '400',
                            letterSpacing: '-0.022em',
                            color: '#1d1d1f',
                            margin: '0 0 8px 0'
                        }}>Competitive Intelligence</h3>
                        <p style={{ 
                            fontSize: '17px',
                            fontWeight: '300',
                            letterSpacing: '0.011em',
                            color: '#86868b',
                            lineHeight: '1.4',
                            margin: '0'
                        }}>Analyze competitor mentions, sentiment, and market positioning in AI responses.</p>
                    </div>
                </div>
            </div>
        </section>
    )
}

const FeaturesSection = () => {
    return <Features />
};

export default FeaturesSection;
