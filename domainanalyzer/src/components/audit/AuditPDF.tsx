import React from 'react';
import { Document, Page, Text, View, StyleSheet, Svg, Circle, G } from '@react-pdf/renderer';

// Define styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  date: {
    fontSize: 10,
    color: '#888',
  },
  section: {
    margin: 10,
    padding: 10,
    flexGrow: 1,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  heroTitle: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
  },
  scoreLarge: {
    fontSize: 48,
    fontWeight: 'normal',
    color: '#000',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 20,
  },
  card: {
    width: '48%',
    backgroundColor: '#fbfbfb',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardTitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  cardScore: {
    fontSize: 24,
    color: '#000',
    marginBottom: 5,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#eee',
    borderRadius: 3,
    marginTop: 5,
    width: '100%',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 15,
  },
  footerText: {
    fontSize: 8,
    color: '#aaa',
  },
  domainText: {
    fontSize: 28,
    fontWeight: 'light',
    color: '#000',
    marginBottom: 5,
  },
  domainLabel: {
    fontSize: 10,
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

interface AuditPDFProps {
  data: {
    performance: number;
    seo: number;
    accessibility: number;
    bestPractices: number;
    updatedAt?: string;
  };
  domain: string;
}

const getScoreColor = (score: number) => {
  if (score >= 0.9) return '#16A34A'; // green
  if (score >= 0.5) return '#F59E0B'; // yellow
  return '#DC2626'; // red
};

const MetricCard = ({ label, value, insight }: { label: string, value: number, insight?: string }) => {
  const percent = Math.round(value * 100);
  const color = getScoreColor(value);
  
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={[styles.cardScore, { color }]}>{percent}</Text>
        <Text style={{ fontSize: 12, color: '#999' }}>/ 100</Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={{ 
          height: '100%', 
          width: `${percent}%`, 
          backgroundColor: color, 
          borderRadius: 3 
        }} />
      </View>
    </View>
  );
};

export const AuditPDF: React.FC<AuditPDFProps> = ({ data, domain }) => {
  const overallScore = Math.round(
    ((data.performance + data.seo + data.accessibility + data.bestPractices) / 4) * 100
  );
  
  const overallColor = getScoreColor(overallScore / 100);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>DomainAnalyzer</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString()}</Text>
        </View>

        <View style={styles.heroSection}>
          <Text style={styles.domainLabel}>Audit Report For</Text>
          <Text style={styles.domainText}>{domain}</Text>
          
          <View style={{ marginTop: 30, alignItems: 'center' }}>
            <Svg height="120" width="120" viewBox="0 0 120 120">
              <Circle
                cx="60"
                cy="60"
                r="50"
                stroke="#eee"
                strokeWidth="8"
                fill="none"
              />
              <Circle
                cx="60"
                cy="60"
                r="50"
                stroke={overallColor}
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(overallScore / 100) * 314} 314`}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
            </Svg>
            <View style={{ position: 'absolute', top: 42, left: 0, right: 0, alignItems: 'center' }}>
              <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#000' }}>{overallScore}</Text>
            </View>
            <Text style={{ fontSize: 10, color: '#888', marginTop: 10 }}>OVERALL SCORE</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <MetricCard label="Performance" value={data.performance} insight="Improve load times, optimize images, and reduce render-blocking scripts."/>
          <MetricCard label="SEO" value={data.seo} insight="Fix meta tags, use proper headings, and ensure mobile-friendly design."/>
          <MetricCard label="Accessibility" value={data.accessibility} insight="Add alt texts, ensure color contrast, and support screen readers."/>
          <MetricCard label="Best Practices" value={data.bestPractices} insight="Update outdated dependencies and follow web security best practices."/>
        </View>

        <View style={{ marginTop: 40, padding: 20, backgroundColor: '#f9fafb', borderRadius: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 10, color: '#333' }}>Summary</Text>
          <Text style={{ fontSize: 10, color: '#666', lineHeight: 1.5 }}>
            This report analyzes the performance, SEO, accessibility, and best practices of your domain. 
            Scores above 90 are considered excellent. Scores between 50 and 89 need improvement, and scores below 50 are poor.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Generated by DomainAnalyzer • power by girlpowertalk</Text>
        </View>
      </Page>
    </Document>
  );
};
