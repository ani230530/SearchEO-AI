import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Circle,
  Image,
} from '@react-pdf/renderer';

// --- Styles ---
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
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
  heroSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  domainLabel: {
    fontSize: 10,
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  domainText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 15,
  },
  overallScoreCircle: {
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 20,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#fbfbfb',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  metricTitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  metricScore: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 6,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#eee',
    borderRadius: 3,
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 6,
  },
  auditGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  auditCard: {
    width: '48%',
    backgroundColor: '#fbfbfb',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 10,
  },
  auditLabel: {
    fontSize: 10,
    color: '#333',
    marginBottom: 4,
  },
  auditValue: {
    fontSize: 10,
    fontFamily: 'Courier',
    color: '#555',
  },
  screenshotWrapper: {
    borderWidth: 0.5,
    borderColor: '#ccc',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 20,
  },
  screenshot: {
    width: '100%',
    height: 200,
    objectFit: 'cover',
  },
  footer: {
    marginTop: 20,
    borderTopWidth: 0.5,
    borderTopColor: '#eee',
    paddingTop: 8,
    textAlign: 'center',
  },
  footerText: {
    fontSize: 8,
    color: '#aaa',
  },
});

// --- Helper: Score Color ---
const getScoreColor = (score: number) => {
  if (score >= 0.9) return '#16A34A';
  if (score >= 0.5) return '#F59E0B';
  return '#DC2626';
};

// --- Metric Card Component ---
const MetricCard = ({ label, value }: { label: string; value: number }) => {
  const percent = Math.round(value * 100);
  const color = getScoreColor(value);

  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricTitle}>{label}</Text>
      <Text style={[styles.metricScore, { color }]}>{percent}</Text>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};

// --- Main PDF Component ---
interface AuditPDFProps {
  data: any; // Lighthouse/PageSpeed data
  domain: string;
}

export const AuditPDF: React.FC<AuditPDFProps> = ({ data, domain }) => {
  if (!data) {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text>No audit data available</Text>
        </Page>
      </Document>
    );
  }

  const overallScore = Math.round(
    ((data.performance + data.seo + data.accessibility + data.bestPractices) / 4) * 100
  );
  const overallColor = getScoreColor(overallScore / 100);

  const metrics = [
    { label: 'Performance', value: data.performance },
    { label: 'SEO', value: data.seo },
    { label: 'Accessibility', value: data.accessibility },
    { label: 'Best Practices', value: data.bestPractices },
  ];

  return (
   <Document>
  {/* Page 1: Score & Metrics */}
  <Page
    size="A4"
    style={{
      ...styles.page,
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}
  >
    {/* Content wrapper */}
    <View>
      <View style={[styles.header, { marginBottom: 30 }]}>{/* header spacing */}
        <Text style={styles.brand}>DomainAnalyzer</Text>
        <Text style={styles.date}>{new Date().toLocaleDateString()}</Text>
      </View>

      <View style={[styles.heroSection, { marginBottom: 30 }]}>{/* hero spacing */}
        <Text style={styles.domainLabel}>Audit Report For</Text>
        <Text style={styles.domainText}>{domain}</Text>

        {/* Overall Score Circle */}
        <View style={styles.overallScoreCircle}>
          <Svg height="120" width="120" viewBox="0 0 120 120">
            <Circle cx="60" cy="60" r="50" stroke="#eee" strokeWidth="8" fill="none" />
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

      <View style={[styles.metricGrid, { marginBottom: 30 }]}>{/* metrics spacing */}
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </View>
    </View>

    <View style={styles.footer}>
      <Text style={styles.footerText}>
        Generated by DomainAnalyzer • {new Date().toLocaleString()}
      </Text>
    </View>
  </Page>

  {/* Page 2: Screenshot & Advanced Metrics */}
  <Page
    size="A4"
    style={{
      ...styles.page,
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}
  >
    <View>
      <View style={{ marginBottom: 20 }}>
        <Text style={styles.sectionTitle}>Website Screenshot</Text>
        {data.screenshot && (
          <View style={styles.screenshotWrapper}>
            <Image src={data.screenshot} style={styles.screenshot} />
          </View>
        )}
      </View>

      {data.audits && (
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>Advanced Metrics</Text>
          <View style={styles.auditGrid}>
            {Object.entries(data.audits).map(([key, value]) => {
              const labels: { [key: string]: string } = {
                fcp: 'First Contentful Paint',
                lcp: 'Largest Contentful Paint',
                cls: 'Cumulative Layout Shift',
                tbt: 'Total Blocking Time',
                speedIndex: 'Speed Index',
              };
              return (
                <View key={key} style={styles.auditCard}>
                  <Text style={styles.auditLabel}>
                    {key.toUpperCase()} ({labels[key] || key})
                  </Text>
                  <Text style={styles.auditValue}>{String(value)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>

    <View style={styles.footer}>
      <Text style={styles.footerText}>
        Generated by DomainAnalyzer • {new Date().toLocaleString()}
      </Text>
    </View>
  </Page>
</Document>

  );
};
