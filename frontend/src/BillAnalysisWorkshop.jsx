import { useState, useEffect } from "react";

export default function BillAnalysisWorkshop() {
  const [selectedBill, setSelectedBill] = useState(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [userAnalysis, setUserAnalysis] = useState({});
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSampleBills();
  }, []);

  const loadSampleBills = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/bills?limit=5");
      if (response.ok) {
        const data = await response.json();
        setBills(data);
      }
    } catch (error) {
      console.error("Failed to load bills:", error);
    } finally {
      setLoading(false);
    }
  };

  const analysisSteps = [
    {
      title: "📋 Bill Overview",
      instruction: "First, let's examine the basic information about this bill.",
      questions: [
        {
          key: "billType",
          question: "What type of bill is this?",
          options: ["Regular legislation", "Budget/Appropriations", "Constitutional amendment", "Commemorative resolution"],
          hint: "Look at the bill type (HR, S, HJRES, etc.) and title for clues."
        }
      ]
    },
    {
      title: "👥 Sponsor Analysis", 
      instruction: "Understanding who introduced the bill helps predict its chances.",
      questions: [
        {
          key: "sponsorParty",
          question: "What party is the primary sponsor from?",
          options: ["Republican", "Democrat", "Independent", "Unknown"],
          hint: "The sponsor's party affiliation often indicates the bill's political lean."
        },
        {
          key: "bipartisanSupport",
          question: "Does this bill have bipartisan cosponsors?",
          options: ["Yes, multiple parties", "Mostly one party", "Only sponsor's party", "Need to research"],
          hint: "Bipartisan bills have much higher success rates."
        }
      ]
    },
    {
      title: "🏛️ Committee Assessment",
      instruction: "Committee dynamics are crucial for bill success.",
      questions: [
        {
          key: "committeeMatch",
          question: "How well does this bill match its committee's priorities?",
          options: ["Perfect fit", "Good match", "Somewhat related", "Poor fit"],
          hint: "Bills that align with committee expertise and priorities move faster."
        }
      ]
    },
    {
      title: "🎯 Success Prediction",
      instruction: "Based on your analysis, predict this bill's likelihood of passage.",
      questions: [
        {
          key: "passagePrediction",
          question: "What are this bill's chances of becoming law?",
          options: ["Very likely (>70%)", "Moderate chance (30-70%)", "Unlikely (10-30%)", "Very unlikely (<10%)"],
          hint: "Consider all factors: bipartisan support, committee fit, complexity, and current political climate."
        }
      ]
    }
  ];

  const handleAnswerSelect = (questionKey, answer) => {
    setUserAnalysis({
      ...userAnalysis,
      [questionKey]: answer
    });
  };

  const nextStep = () => {
    if (analysisStep < analysisSteps.length - 1) {
      setAnalysisStep(analysisStep + 1);
    }
  };

  const prevStep = () => {
    if (analysisStep > 0) {
      setAnalysisStep(analysisStep - 1);
    }
  };

  const startAnalysis = (bill) => {
    setSelectedBill(bill);
    setAnalysisStep(0);
    setUserAnalysis({});
  };

  const resetWorkshop = () => {
    setSelectedBill(null);
    setAnalysisStep(0);
    setUserAnalysis({});
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div>Loading bills for analysis...</div>
      </div>
    );
  }

  if (!selectedBill) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
        <div style={{ marginBottom: 30 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            🔍 Bill Analysis Workshop
          </h1>
          <p style={{ fontSize: 16, color: "#6b7280" }}>
            Learn to analyze real congressional bills step-by-step. Select a bill below to begin your analysis.
          </p>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {bills.map((bill) => (
            <div
              key={`${bill.congress}-${bill.bill_type}-${bill.bill_number}`}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 20,
                background: "white",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onClick={() => startAnalysis(bill)}
              onMouseEnter={(e) => {
                e.target.style.borderColor = "#2563eb";
                e.target.style.boxShadow = "0 4px 12px rgba(37, 99, 235, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = "#e5e7eb";
                e.target.style.boxShadow = "none";
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                  {bill.bill_type.toUpperCase()} {bill.bill_number}
                </h3>
                <span style={{ 
                  fontSize: 12, 
                  background: "#f3f4f6", 
                  padding: "4px 8px", 
                  borderRadius: 4 
                }}>
                  Congress {bill.congress}
                </span>
              </div>
              
              <p style={{ margin: "0 0 12px 0", color: "#374151", lineHeight: 1.4 }}>
                {bill.title || "No title available"}
              </p>
              
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                Click to analyze this bill →
              </div>
            </div>
          ))}
        </div>

        {bills.length === 0 && (
          <div style={{ 
            padding: 40, 
            textAlign: "center", 
            color: "#6b7280",
            border: "1px dashed #e5e7eb",
            borderRadius: 8
          }}>
            No bills available for analysis. Make sure the backend is running.
          </div>
        )}
      </div>
    );
  }

  const currentStepData = analysisSteps[analysisStep];
  const isLastStep = analysisStep === analysisSteps.length - 1;
  const canProceed = currentStepData.questions.every(q => userAnalysis[q.key] !== undefined);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={resetWorkshop}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            background: "white",
            color: "#374151",
            cursor: "pointer",
            fontWeight: 500,
            marginBottom: 15
          }}
        >
          ← Choose Different Bill
        </button>
        
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          Analyzing: {selectedBill.bill_type.toUpperCase()} {selectedBill.bill_number}
        </h2>
        <p style={{ color: "#6b7280", marginBottom: 0 }}>
          {selectedBill.title}
        </p>
      </div>

      {/* Analysis Interface */}
      <div style={{ 
        background: "white", 
        border: "1px solid #e5e7eb", 
        borderRadius: 12, 
        overflow: "hidden"
      }}>
        {/* Progress */}
        <div style={{ background: "#f8fafc", padding: "15px 20px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {currentStepData.title}
            </h3>
            <span style={{ fontSize: 14, color: "#6b7280" }}>
              Step {analysisStep + 1} of {analysisSteps.length}
            </span>
          </div>
          
          <div style={{ background: "#e5e7eb", height: 6, borderRadius: 3, overflow: "hidden" }}>
            <div 
              style={{ 
                background: "#2563eb", 
                height: "100%", 
                width: `${((analysisStep + 1) / analysisSteps.length) * 100}%`,
                transition: "width 0.3s ease"
              }} 
            />
          </div>
        </div>

        {/* Step Content */}
        <div style={{ padding: 30 }}>
          <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 25 }}>
            {currentStepData.instruction}
          </p>

          {currentStepData.questions.map((question, qIndex) => (
            <div key={question.key} style={{ marginBottom: 25 }}>
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 15 }}>
                {question.question}
              </h4>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 15 }}>
                {question.options.map((option, oIndex) => (
                  <button
                    key={oIndex}
                    onClick={() => handleAnswerSelect(question.key, option)}
                    style={{
                      padding: "12px 16px",
                      borderRadius: 6,
                      border: userAnalysis[question.key] === option ? "2px solid #2563eb" : "1px solid #e5e7eb",
                      background: userAnalysis[question.key] === option ? "#eff6ff" : "white",
                      color: "#374151",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.2s"
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <div style={{ 
                fontSize: 14, 
                color: "#6b7280", 
                background: "#f8fafc", 
                padding: 12, 
                borderRadius: 6,
                border: "1px solid #e5e7eb"
              }}>
                💡 <strong>Hint:</strong> {question.hint}
              </div>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div style={{ 
          background: "#f8fafc", 
          padding: 20, 
          borderTop: "1px solid #e5e7eb",
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center" 
        }}>
          <button
            onClick={prevStep}
            disabled={analysisStep === 0}
            style={{
              padding: "10px 20px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: analysisStep === 0 ? "#f9fafb" : "white",
              color: analysisStep === 0 ? "#9ca3af" : "#374151",
              cursor: analysisStep === 0 ? "not-allowed" : "pointer",
              fontWeight: 500
            }}
          >
            ← Previous
          </button>

          <div style={{ fontSize: 14, color: canProceed ? "#10b981" : "#6b7280" }}>
            {canProceed ? "Ready to continue" : "Answer all questions to proceed"}
          </div>

          <button
            onClick={nextStep}
            disabled={!canProceed}
            style={{
              padding: "10px 20px",
              borderRadius: 6,
              border: "none",
              background: !canProceed ? "#e5e7eb" : (isLastStep ? "#10b981" : "#2563eb"),
              color: !canProceed ? "#9ca3af" : "white",
              cursor: !canProceed ? "not-allowed" : "pointer",
              fontWeight: 500
            }}
          >
            {isLastStep ? "Complete Analysis" : "Next Step →"}
          </button>
        </div>
      </div>

      {/* Analysis Summary */}
      {isLastStep && Object.keys(userAnalysis).length > 0 && (
        <div style={{ 
          marginTop: 20, 
          padding: 20, 
          background: "#ecfdf5", 
          border: "1px solid #10b981", 
          borderRadius: 12 
        }}>
          <h3 style={{ margin: "0 0 15px 0", color: "#065f46" }}>
            📊 Your Analysis Summary
          </h3>
          <div style={{ display: "grid", gap: 10 }}>
            {Object.entries(userAnalysis).map(([key, value]) => (
              <div key={key} style={{ fontSize: 14 }}>
                <strong>{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong> {value}
              </div>
            ))}
          </div>
          
          <div style={{ marginTop: 15, padding: 15, background: "white", borderRadius: 6 }}>
            <strong>🎯 Next Steps:</strong> Use this analysis to make informed predictions in the betting markets!
          </div>
        </div>
      )}
    </div>
  );
}