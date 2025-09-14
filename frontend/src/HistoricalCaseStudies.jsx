import { useState } from "react";

export default function HistoricalCaseStudies() {
  const [selectedCase, setSelectedCase] = useState(null);
  const [activeTimelineEvent, setActiveTimelineEvent] = useState(null);

  const caseStudies = [
    {
      id: "civil-rights-1964",
      title: "Civil Rights Act of 1964",
      subtitle: "Landmark legislation ending segregation",
      billNumber: "H.R. 7152",
      congress: "88th Congress",
      outcome: "Signed into law",
      significance: "Ended legal segregation and discrimination",
      keyLessons: [
        "Bipartisan leadership was crucial for passage",
        "Public pressure and activism influenced lawmakers",
        "Senate filibuster was overcome through persistence",
        "Committee strategy and timing were essential"
      ],
      timeline: [
        {
          date: "June 19, 1963",
          event: "Bill Introduced",
          description: "President Kennedy sends comprehensive civil rights bill to Congress after Birmingham protests",
          type: "introduction",
          lesson: "Crisis events can create momentum for major legislation"
        },
        {
          date: "November 22, 1963",
          event: "Presidential Assassination",
          description: "JFK assassinated; LBJ becomes President and champions the bill",
          type: "external",
          lesson: "Leadership transitions can either help or hurt legislation"
        },
        {
          date: "February 10, 1964",
          event: "House Passage",
          description: "House passes bill 290-130 after intense committee work and floor debate",
          type: "passage",
          lesson: "Strong committee leadership (Rep. Celler) was essential for House success"
        },
        {
          date: "March-June 1964",
          event: "Senate Filibuster",
          description: "Southern senators filibuster for 60 working days, longest in Senate history",
          type: "obstacle",
          lesson: "Determined opposition can significantly delay legislation"
        },
        {
          date: "June 10, 1964",
          event: "Cloture Vote",
          description: "Senate votes 71-29 to end filibuster, first successful cloture on civil rights",
          type: "breakthrough",
          lesson: "Bipartisan coalition (Republicans + Northern Democrats) was key to breaking filibuster"
        },
        {
          date: "June 19, 1964",
          event: "Senate Passage",
          description: "Senate passes bill 73-27, exactly one year after introduction",
          type: "passage",
          lesson: "Persistence and coalition-building eventually overcame opposition"
        },
        {
          date: "July 2, 1964",
          event: "Signed into Law",
          description: "President Johnson signs the Civil Rights Act in a televised ceremony",
          type: "enactment",
          lesson: "Presidential leadership and public ceremony emphasized historic importance"
        }
      ],
      impact: {
        immediate: "Ended legal segregation in public accommodations, employment, and education",
        longTerm: "Foundation for subsequent civil rights legislation and social change",
        political: "Realigned political parties and voting patterns for decades"
      }
    },
    {
      id: "aca-2009",
      title: "Affordable Care Act (ACA)",
      subtitle: "Healthcare reform in a polarized era",
      billNumber: "H.R. 3590",
      congress: "111th Congress",
      outcome: "Signed into law",
      significance: "Expanded healthcare coverage to millions",
      keyLessons: [
        "Partisan legislation faces ongoing challenges",
        "Reconciliation process can bypass filibuster",
        "Interest group opposition can be intense",
        "Implementation challenges affect public perception"
      ],
      timeline: [
        {
          date: "September 17, 2009",
          event: "Bill Introduced",
          description: "House introduces comprehensive healthcare reform bill",
          type: "introduction",
          lesson: "Complex legislation requires extensive preparation and stakeholder input"
        },
        {
          date: "November 7, 2009",
          event: "House Passage (First)",
          description: "House passes bill 220-215, mostly along party lines",
          type: "passage",
          lesson: "Narrow margins require careful vote counting and party discipline"
        },
        {
          date: "December 24, 2009",
          event: "Senate Passage",
          description: "Senate passes different version 60-39, exactly along party lines",
          type: "passage",
          lesson: "Senate rules (filibuster) required 60-vote supermajority"
        },
        {
          date: "January 19, 2010",
          event: "Scott Brown Election",
          description: "Republican wins Massachusetts Senate seat, breaking Democratic supermajority",
          type: "obstacle",
          lesson: "Special elections can dramatically change legislative dynamics"
        },
        {
          date: "March 21, 2010",
          event: "House Passes Senate Version",
          description: "House passes Senate bill 219-212 to avoid conference committee",
          type: "passage",
          lesson: "Strategic decisions (avoiding conference) can overcome procedural obstacles"
        },
        {
          date: "March 23, 2010",
          event: "Signed into Law",
          description: "President Obama signs ACA into law",
          type: "enactment",
          lesson: "Major legislation often passes with minimal bipartisan support in polarized times"
        },
        {
          date: "2010-Present",
          event: "Ongoing Challenges",
          description: "Multiple repeal attempts, court challenges, and implementation issues",
          type: "aftermath",
          lesson: "Partisan legislation faces continued political and legal challenges"
        }
      ],
      impact: {
        immediate: "Extended health insurance to ~20 million Americans",
        longTerm: "Ongoing political issue and policy debates about healthcare role",
        political: "Became central issue in multiple election cycles"
      }
    },
    {
      id: "infrastructure-2021",
      title: "Infrastructure Investment and Jobs Act",
      subtitle: "Bipartisan success in polarized times",
      billNumber: "H.R. 3684",
      congress: "117th Congress",
      outcome: "Signed into law",
      significance: "Largest infrastructure investment in decades",
      keyLessons: [
        "Bipartisan coalitions still possible on popular issues",
        "Infrastructure has broad appeal across party lines",
        "Negotiation and compromise can produce major legislation",
        "Presidential leadership matters for coalition building"
      ],
      timeline: [
        {
          date: "June 4, 2021",
          event: "Bipartisan Framework",
          description: "Biden announces bipartisan framework with group of senators",
          type: "introduction",
          lesson: "Early bipartisan engagement can set foundation for success"
        },
        {
          date: "July 28, 2021",
          event: "Senate Cloture Vote",
          description: "Senate votes 67-32 to begin debate, showing bipartisan support",
          type: "breakthrough",
          lesson: "Strong bipartisan support can overcome procedural hurdles easily"
        },
        {
          date: "August 10, 2021",
          event: "Senate Passage",
          description: "Senate passes bill 69-30 with 19 Republican votes",
          type: "passage",
          lesson: "Infrastructure's popular appeal attracted significant Republican support"
        },
        {
          date: "September-November 2021",
          event: "House Negotiations",
          description: "House Democrats debate linking infrastructure to social spending bill",
          type: "obstacle",
          lesson: "Intraparty disagreements can delay even bipartisan legislation"
        },
        {
          date: "November 5, 2021",
          event: "House Passage",
          description: "House passes bill 228-206 with 13 Republican votes",
          type: "passage",
          lesson: "Some Republicans willing to support popular bipartisan measures"
        },
        {
          date: "November 15, 2021",
          event: "Signed into Law",
          description: "Biden signs $1.2 trillion infrastructure bill with bipartisan ceremony",
          type: "enactment",
          lesson: "Bipartisan achievements deserve bipartisan celebration"
        }
      ],
      impact: {
        immediate: "$1.2 trillion investment in roads, bridges, broadband, and clean energy",
        longTerm: "Modernizing American infrastructure for 21st century economy",
        political: "Demonstrated bipartisan cooperation still possible on popular issues"
      }
    }
  ];

  const getEventTypeColor = (type) => {
    const colors = {
      introduction: "#3b82f6",
      passage: "#10b981",
      obstacle: "#ef4444",
      breakthrough: "#f59e0b",
      external: "#8b5cf6",
      enactment: "#059669",
      aftermath: "#6b7280"
    };
    return colors[type] || "#6b7280";
  };

  const getEventTypeIcon = (type) => {
    const icons = {
      introduction: "📝",
      passage: "✅",
      obstacle: "🚧",
      breakthrough: "💡",
      external: "⚡",
      enactment: "🏛️",
      aftermath: "📊"
    };
    return icons[type] || "📅";
  };

  if (selectedCase) {
    const caseData = caseStudies.find(c => c.id === selectedCase);
    
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
        {/* Header */}
        <div style={{ marginBottom: 30 }}>
          <button
            onClick={() => setSelectedCase(null)}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#374151",
              cursor: "pointer",
              fontWeight: 500,
              marginBottom: 20
            }}
          >
            ← Back to Case Studies
          </button>
          
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
                {caseData.title}
              </h1>
              <p style={{ fontSize: 18, color: "#6b7280", marginBottom: 12 }}>
                {caseData.subtitle}
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span style={{ 
                  background: "#dbeafe", 
                  color: "#1e40af", 
                  padding: "4px 12px", 
                  borderRadius: 999, 
                  fontSize: 14, 
                  fontWeight: 600 
                }}>
                  {caseData.billNumber}
                </span>
                <span style={{ 
                  background: "#f3e8ff", 
                  color: "#7c3aed", 
                  padding: "4px 12px", 
                  borderRadius: 999, 
                  fontSize: 14, 
                  fontWeight: 600 
                }}>
                  {caseData.congress}
                </span>
                <span style={{ 
                  background: "#ecfdf5", 
                  color: "#065f46", 
                  padding: "4px 12px", 
                  borderRadius: 999, 
                  fontSize: 14, 
                  fontWeight: 600 
                }}>
                  {caseData.outcome}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 30 }}>
          {/* Timeline */}
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}>
              📅 Legislative Timeline
            </h2>
            
            <div style={{ position: "relative" }}>
              {/* Timeline line */}
              <div style={{
                position: "absolute",
                left: 20,
                top: 0,
                bottom: 0,
                width: 2,
                background: "#e5e7eb"
              }} />
              
              {caseData.timeline.map((event, index) => (
                <div
                  key={index}
                  style={{
                    position: "relative",
                    marginBottom: 30,
                    paddingLeft: 60,
                    cursor: "pointer"
                  }}
                  onClick={() => setActiveTimelineEvent(
                    activeTimelineEvent === index ? null : index
                  )}
                >
                  {/* Timeline dot */}
                  <div style={{
                    position: "absolute",
                    left: 12,
                    top: 8,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: getEventTypeColor(event.type),
                    border: "3px solid white",
                    boxShadow: "0 0 0 2px #e5e7eb"
                  }} />
                  
                  {/* Event content */}
                  <div style={{
                    background: activeTimelineEvent === index ? "#f8fafc" : "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 16,
                    transition: "all 0.2s"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}>{getEventTypeIcon(event.type)}</span>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                        {event.event}
                      </h3>
                      <span style={{ fontSize: 14, color: "#6b7280" }}>
                        {event.date}
                      </span>
                    </div>
                    
                    <p style={{ margin: "0 0 12px 0", color: "#374151", lineHeight: 1.5 }}>
                      {event.description}
                    </p>
                    
                    {activeTimelineEvent === index && (
                      <div style={{
                        background: "#eff6ff",
                        border: "1px solid #2563eb",
                        borderRadius: 6,
                        padding: 12,
                        marginTop: 12
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1e40af", marginBottom: 4 }}>
                          💡 Key Lesson:
                        </div>
                        <div style={{ fontSize: 14, color: "#1e40af" }}>
                          {event.lesson}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div>
            {/* Key Lessons */}
            <div style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20
            }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>
                🎯 Key Lessons
              </h3>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {caseData.keyLessons.map((lesson, index) => (
                  <li key={index} style={{ marginBottom: 8, lineHeight: 1.4 }}>
                    {lesson}
                  </li>
                ))}
              </ul>
            </div>

            {/* Impact */}
            <div style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20
            }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>
                📊 Impact & Legacy
              </h3>
              
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600, color: "#059669" }}>
                  Immediate Impact
                </h4>
                <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.4 }}>
                  {caseData.impact.immediate}
                </p>
              </div>
              
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600, color: "#2563eb" }}>
                  Long-term Effects
                </h4>
                <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.4 }}>
                  {caseData.impact.longTerm}
                </p>
              </div>
              
              <div>
                <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600, color: "#7c3aed" }}>
                  Political Legacy
                </h4>
                <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.4 }}>
                  {caseData.impact.political}
                </p>
              </div>
            </div>

            {/* Tip */}
            <div style={{
              background: "#fef3c7",
              border: "1px solid #f59e0b",
              borderRadius: 12,
              padding: 16
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#92400e", marginBottom: 8 }}>
                💡 Study Tip
              </div>
              <div style={{ fontSize: 14, color: "#92400e", lineHeight: 1.4 }}>
                Click on timeline events to see key lessons. Notice how different factors (leadership, timing, external events) influenced the outcome.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          📚 Historical Case Studies
        </h1>
        <p style={{ fontSize: 18, color: "#6b7280" }}>
          Learn from major legislation throughout history. See how bills navigate the legislative process and what factors lead to success or failure.
        </p>
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        {caseStudies.map((study) => (
          <div
            key={study.id}
            onClick={() => setSelectedCase(study.id)}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 24,
              background: "white",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = "#2563eb";
              e.target.style.boxShadow = "0 4px 12px rgba(37, 99, 235, 0.1)";
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = "#e5e7eb";
              e.target.style.boxShadow = "none";
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: "0 0 8px 0", fontSize: 20, fontWeight: 600 }}>
                  {study.title}
                </h2>
                <p style={{ margin: "0 0 12px 0", color: "#6b7280", fontSize: 16 }}>
                  {study.subtitle}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <span style={{ 
                    background: "#dbeafe", 
                    color: "#1e40af", 
                    padding: "2px 8px", 
                    borderRadius: 999, 
                    fontSize: 12, 
                    fontWeight: 600 
                  }}>
                    {study.billNumber}
                  </span>
                  <span style={{ 
                    background: "#f3e8ff", 
                    color: "#7c3aed", 
                    padding: "2px 8px", 
                    borderRadius: 999, 
                    fontSize: 12, 
                    fontWeight: 600 
                  }}>
                    {study.congress}
                  </span>
                  <span style={{ 
                    background: "#ecfdf5", 
                    color: "#065f46", 
                    padding: "2px 8px", 
                    borderRadius: 999, 
                    fontSize: 12, 
                    fontWeight: 600 
                  }}>
                    {study.outcome}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>
                  {study.significance}
                </p>
              </div>
              <div style={{ fontSize: 24, marginLeft: 16 }}>→</div>
            </div>
            
            <div style={{ 
              background: "#f8fafc", 
              borderRadius: 8, 
              padding: 12,
              fontSize: 14,
              color: "#6b7280"
            }}>
              Click to explore the {study.timeline.length}-step legislative journey and key lessons learned
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}