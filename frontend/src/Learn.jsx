import { useState } from "react";
import CivicsQuiz from "./CivicsQuiz";
import BillAnalysisWorkshop from "./BillAnalysisWorkshop";
import HistoricalCaseStudies from "./HistoricalCaseStudies";
import { useAchievements, AchievementNotification, AchievementPanel, ACHIEVEMENTS } from "./AchievementSystem";

export default function Learn() {
  const [currentTutorial, setCurrentTutorial] = useState("overview");
  const [currentStep, setCurrentStep] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showWorkshop, setShowWorkshop] = useState(false);
  const [showCaseStudies, setShowCaseStudies] = useState(false);
  const [newAchievement, setNewAchievement] = useState(null);
  
  const { achievements, unlockAchievement } = useAchievements();

  const tutorials = {
    overview: {
      title: "How Congress Works",
      description: "Learn the basics of the U.S. legislative process",
      steps: [
        {
          title: "Welcome to Congress 101",
          content: (
            <div>
              <h3>Understanding the U.S. Legislative Process</h3>
              <p>Congress is the legislative branch of the U.S. government, responsible for making laws. It consists of two chambers:</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, margin: "20px 0" }}>
                <div style={{ padding: 20, border: "2px solid #2563eb", borderRadius: 8 }}>
                  <h4>🏛️ House of Representatives</h4>
                  <ul>
                    <li>435 members</li>
                    <li>2-year terms</li>
                    <li>Represents districts</li>
                    <li>Initiates spending bills</li>
                  </ul>
                </div>
                <div style={{ padding: 20, border: "2px solid #dc2626", borderRadius: 8 }}>
                  <h4>🏛️ Senate</h4>
                  <ul>
                    <li>100 members</li>
                    <li>6-year terms</li>
                    <li>Represents states</li>
                    <li>Confirms appointments</li>
                  </ul>
                </div>
              </div>
              <p>Both chambers must pass identical versions of a bill for it to become law.</p>
            </div>
          )
        },
        {
          title: "Step 1: Bill Introduction",
          content: (
            <div>
              <h3>📝 How Bills Are Born</h3>
              <p>Anyone can draft a bill, but only members of Congress can introduce them:</p>
              
              <div style={{ background: "#f8fafc", padding: 20, borderRadius: 8, margin: "15px 0" }}>
                <h4>Bill Types & Numbering:</h4>
                <ul>
                  <li><strong>HR ###</strong> - House bills (general legislation)</li>
                  <li><strong>S ###</strong> - Senate bills (general legislation)</li>
                  <li><strong>HRES ###</strong> - House resolutions (House rules, opinions)</li>
                  <li><strong>SRES ###</strong> - Senate resolutions (Senate rules, opinions)</li>
                  <li><strong>HJRES ###</strong> - House joint resolutions (constitutional amendments)</li>
                  <li><strong>SJRES ###</strong> - Senate joint resolutions (constitutional amendments)</li>
                </ul>
              </div>

              <div style={{ background: "#ecfdf5", padding: 15, borderRadius: 8, border: "1px solid #10b981" }}>
                <p><strong>💡 Fun Fact:</strong> Bills are numbered sequentially each Congress (2-year period). HR 1 is always the first House bill introduced!</p>
              </div>
            </div>
          )
        },
        {
          title: "Step 2: Committee Review",
          content: (
            <div>
              <h3>🔍 Committee Process</h3>
              <p>After introduction, bills go to relevant committees for detailed review:</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 15, margin: "20px 0" }}>
                <div style={{ padding: 15, background: "#fef3c7", borderRadius: 8, borderLeft: "4px solid #f59e0b" }}>
                  <h4>Committee Assignment</h4>
                  <p>Bills are referred to committees based on subject matter (e.g., Agriculture, Judiciary, Armed Services)</p>
                </div>
                
                <div style={{ padding: 15, background: "#dbeafe", borderRadius: 8, borderLeft: "4px solid #3b82f6" }}>
                  <h4>Markup Process</h4>
                  <p>Committee members debate, amend, and vote on the bill. They can:</p>
                  <ul>
                    <li>Report it favorably (send to floor)</li>
                    <li>Report it unfavorably (rarely done)</li>
                    <li>Table it (effectively killing it)</li>
                  </ul>
                </div>
                
                <div style={{ padding: 15, background: "#f3e8ff", borderRadius: 8, borderLeft: "4px solid #8b5cf6" }}>
                  <h4>Subcommittees</h4>
                  <p>Complex bills may go to specialized subcommittees first for detailed analysis</p>
                </div>
              </div>

              <div style={{ background: "#fef2f2", padding: 15, borderRadius: 8, border: "1px solid #ef4444" }}>
                <p><strong>⚠️ Reality Check:</strong> Most bills die in committee! Only about 4% of introduced bills become law.</p>
              </div>
            </div>
          )
        },
        {
          title: "Step 3: Floor Consideration",
          content: (
            <div>
              <h3>🗳️ Floor Votes</h3>
              <p>Bills that survive committee go to the full chamber for debate and voting:</p>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, margin: "20px 0" }}>
                <div style={{ padding: 20, border: "2px solid #2563eb", borderRadius: 8 }}>
                  <h4>House Floor Process</h4>
                  <ul>
                    <li><strong>Rules Committee:</strong> Sets debate rules</li>
                    <li><strong>Debate:</strong> Usually limited time</li>
                    <li><strong>Amendments:</strong> May be restricted</li>
                    <li><strong>Vote:</strong> Simple majority (218+ votes)</li>
                  </ul>
                </div>
                
                <div style={{ padding: 20, border: "2px solid #dc2626", borderRadius: 8 }}>
                  <h4>Senate Floor Process</h4>
                  <ul>
                    <li><strong>Unlimited Debate:</strong> Filibuster possible</li>
                    <li><strong>Cloture:</strong> 60 votes to end debate</li>
                    <li><strong>Amendments:</strong> More flexible</li>
                    <li><strong>Vote:</strong> Simple majority (51+ votes)</li>
                  </ul>
                </div>
              </div>

              <div style={{ background: "#ecfdf5", padding: 15, borderRadius: 8, border: "1px solid #10b981" }}>
                <p><strong>🎯 Key Insight:</strong> The Senate's filibuster rule means most legislation needs 60 votes to pass, not just 51!</p>
              </div>
            </div>
          )
        },
        {
          title: "Step 4: Other Chamber",
          content: (
            <div>
              <h3>🔄 Bicameral Process</h3>
              <p>After passing one chamber, the bill goes to the other chamber and repeats the process:</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 15, margin: "20px 0" }}>
                <div style={{ padding: 20, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <h4>Three Possible Outcomes:</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 15, marginTop: 10 }}>
                    <div style={{ padding: 15, background: "#ecfdf5", borderRadius: 6 }}>
                      <h5>✅ Pass Identical Bill</h5>
                      <p>Goes directly to President</p>
                    </div>
                    <div style={{ padding: 15, background: "#fef3c7", borderRadius: 6 }}>
                      <h5>📝 Pass Amended Bill</h5>
                      <p>Goes back to first chamber</p>
                    </div>
                    <div style={{ padding: 15, background: "#fef2f2", borderRadius: 6 }}>
                      <h5>❌ Reject Bill</h5>
                      <p>Bill dies (unless overridden)</p>
                    </div>
                  </div>
                </div>
                
                <div style={{ padding: 15, background: "#dbeafe", borderRadius: 8, borderLeft: "4px solid #3b82f6" }}>
                  <h4>Conference Committee</h4>
                  <p>When chambers pass different versions, they may form a conference committee to work out differences and create a compromise bill.</p>
                </div>
              </div>

              <div style={{ background: "#f3e8ff", padding: 15, borderRadius: 8, border: "1px solid #8b5cf6" }}>
                <p><strong>🔍 Did You Know?</strong> The exact same text must pass both chambers. Even a single comma difference requires another vote!</p>
              </div>
            </div>
          )
        },
        {
          title: "Step 5: Presidential Action",
          content: (
            <div>
              <h3>🏛️ Presidential Decision</h3>
              <p>Once both chambers pass identical bills, it goes to the President:</p>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, margin: "20px 0" }}>
                <div style={{ padding: 20, background: "#ecfdf5", borderRadius: 8, border: "2px solid #10b981" }}>
                  <h4>✅ Sign Into Law</h4>
                  <p>President signs the bill and it becomes law immediately (or on a specified date).</p>
                  <div style={{ marginTop: 10, fontSize: 14, color: "#059669" }}>
                    <strong>Timeline:</strong> President has 10 days to decide
                  </div>
                </div>
                
                <div style={{ padding: 20, background: "#fef2f2", borderRadius: 8, border: "2px solid #ef4444" }}>
                  <h4>❌ Veto</h4>
                  <p>President rejects the bill and sends it back to Congress with objections.</p>
                  <div style={{ marginTop: 10, fontSize: 14, color: "#dc2626" }}>
                    <strong>Override:</strong> Congress can override with 2/3 majority in both chambers
                  </div>
                </div>
              </div>

              <div style={{ background: "#fef3c7", padding: 15, borderRadius: 8, border: "1px solid #f59e0b" }}>
                <h4>📋 Pocket Veto</h4>
                <p>If Congress adjourns within 10 days and the President doesn't sign, the bill dies automatically.</p>
              </div>

              <div style={{ background: "#ecfdf5", padding: 15, borderRadius: 8, border: "1px solid #10b981", marginTop: 15 }}>
                <p><strong>🎉 Congratulations!</strong> You now understand the basic legislative process! This knowledge will help you make more informed predictions about bill outcomes.</p>
              </div>
            </div>
          )
        }
      ]
    },
    
    billTypes: {
      title: "Understanding Bill Types",
      description: "Learn about different types of congressional legislation",
      steps: [
        {
          title: "Bills vs Resolutions",
          content: (
            <div>
              <h3>📋 Types of Congressional Legislation</h3>
              <p>Congress considers several types of legislation, each with different purposes and requirements:</p>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, margin: "20px 0" }}>
                <div style={{ padding: 20, background: "#dbeafe", borderRadius: 8, border: "2px solid #3b82f6" }}>
                  <h4>📜 Bills (HR/S)</h4>
                  <ul>
                    <li>Become public law when enacted</li>
                    <li>Require both chambers + President</li>
                    <li>Most common type of legislation</li>
                    <li>Examples: Budget bills, policy changes</li>
                  </ul>
                </div>
                
                <div style={{ padding: 20, background: "#f3e8ff", borderRadius: 8, border: "2px solid #8b5cf6" }}>
                  <h4>📝 Resolutions</h4>
                  <ul>
                    <li>Express opinions or set rules</li>
                    <li>Don't become law</li>
                    <li>Various types and purposes</li>
                    <li>Examples: Commemorations, procedures</li>
                  </ul>
                </div>
              </div>
            </div>
          )
        },
        {
          title: "House Bills (HR)",
          content: (
            <div>
              <h3>🏛️ House Bills (HR ###)</h3>
              <p>House bills are the most common type of legislation and can cover any topic within Congress's constitutional authority:</p>
              
              <div style={{ background: "#f8fafc", padding: 20, borderRadius: 8, margin: "15px 0" }}>
                <h4>Examples of House Bills:</h4>
                <ul>
                  <li><strong>HR 1</strong> - Often a major priority bill (varies by party in control)</li>
                  <li><strong>Appropriations Bills</strong> - Fund government operations</li>
                  <li><strong>Authorization Bills</strong> - Create or modify programs</li>
                  <li><strong>Tax Bills</strong> - Must originate in the House per Constitution</li>
                </ul>
              </div>

              <div style={{ background: "#ecfdf5", padding: 15, borderRadius: 8, border: "1px solid #10b981" }}>
                <p><strong>💡 Constitutional Requirement:</strong> All revenue (tax) bills must originate in the House of Representatives!</p>
              </div>
            </div>
          )
        },
        {
          title: "Senate Bills (S)",
          content: (
            <div>
              <h3>🏛️ Senate Bills (S ###)</h3>
              <p>Senate bills work similarly to House bills but originate in the Senate:</p>
              
              <div style={{ background: "#fef2f2", padding: 20, borderRadius: 8, margin: "15px 0" }}>
                <h4>Key Differences:</h4>
                <ul>
                  <li><strong>Cannot initiate tax bills</strong> - Constitutional restriction</li>
                  <li><strong>Often more bipartisan</strong> - Senate rules encourage cooperation</li>
                  <li><strong>Fewer bills introduced</strong> - Senators represent entire states</li>
                  <li><strong>More deliberative process</strong> - Unlimited debate allowed</li>
                </ul>
              </div>

              <div style={{ background: "#dbeafe", padding: 15, borderRadius: 8, border: "1px solid #3b82f6" }}>
                <p><strong>🎯 Strategy Tip:</strong> Senate bills often have broader support before introduction due to the chamber's collaborative culture.</p>
              </div>
            </div>
          )
        },
        {
          title: "Joint Resolutions (HJRES/SJRES)",
          content: (
            <div>
              <h3>⚖️ Joint Resolutions</h3>
              <p>Joint resolutions have the force of law, just like bills, but are used for specific purposes:</p>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, margin: "20px 0" }}>
                <div style={{ padding: 20, background: "#fef3c7", borderRadius: 8, border: "2px solid #f59e0b" }}>
                  <h4>🏛️ Constitutional Amendments</h4>
                  <p>The primary use of joint resolutions is to propose constitutional amendments.</p>
                  <ul>
                    <li>Requires 2/3 majority in both chambers</li>
                    <li>Goes to states, not President</li>
                    <li>Need 3/4 of states to ratify</li>
                  </ul>
                </div>
                
                <div style={{ padding: 20, background: "#ecfdf5", borderRadius: 8, border: "2px solid #10b981" }}>
                  <h4>⏰ Continuing Resolutions</h4>
                  <p>Temporary funding to keep government running.</p>
                  <ul>
                    <li>Used when budget isn't passed on time</li>
                    <li>Prevents government shutdowns</li>
                    <li>Usually short-term solutions</li>
                  </ul>
                </div>
              </div>

              <div style={{ background: "#f3e8ff", padding: 15, borderRadius: 8, border: "1px solid #8b5cf6" }}>
                <p><strong>🔍 Fun Fact:</strong> The 27th Amendment (congressional pay) was proposed in 1789 but not ratified until 1992!</p>
              </div>
            </div>
          )
        },
        {
          title: "Simple Resolutions (HRES/SRES)",
          content: (
            <div>
              <h3>📝 Simple Resolutions</h3>
              <p>These affect only the chamber that passes them and don't become law:</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 15, margin: "20px 0" }}>
                <div style={{ padding: 15, background: "#dbeafe", borderRadius: 8, borderLeft: "4px solid #3b82f6" }}>
                  <h4>House Rules (HRES)</h4>
                  <p>Set procedures for how the House operates, including:</p>
                  <ul>
                    <li>Debate time limits for specific bills</li>
                    <li>Amendment procedures</li>
                    <li>Committee structures</li>
                  </ul>
                </div>
                
                <div style={{ padding: 15, background: "#fef2f2", borderRadius: 8, borderLeft: "4px solid #ef4444" }}>
                  <h4>Senate Rules (SRES)</h4>
                  <p>Similar to House rules but for Senate procedures:</p>
                  <ul>
                    <li>Committee assignments</li>
                    <li>Floor procedures</li>
                    <li>Administrative matters</li>
                  </ul>
                </div>
                
                <div style={{ padding: 15, background: "#f3e8ff", borderRadius: 8, borderLeft: "4px solid #8b5cf6" }}>
                  <h4>Commemorative Resolutions</h4>
                  <p>Express opinions or commemorate events:</p>
                  <ul>
                    <li>Honoring individuals or groups</li>
                    <li>Recognizing historical events</li>
                    <li>Expressing chamber's position on issues</li>
                  </ul>
                </div>
              </div>
            </div>
          )
        }
      ]
    },

    predictions: {
      title: "Making Smart Predictions",
      description: "Learn how to analyze bills and predict outcomes like a political scientist",
      steps: [
        {
          title: "Factors That Influence Bill Success",
          content: (
            <div>
              <h3>🎯 What Makes Bills Pass or Fail?</h3>
              <p>Political scientists have identified key factors that influence whether legislation succeeds:</p>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, margin: "20px 0" }}>
                <div style={{ padding: 20, background: "#ecfdf5", borderRadius: 8, border: "2px solid #10b981" }}>
                  <h4>✅ Success Factors</h4>
                  <ul>
                    <li><strong>Bipartisan support</strong> - Bills with sponsors from both parties</li>
                    <li><strong>Committee backing</strong> - Strong committee support</li>
                    <li><strong>Leadership priority</strong> - Speaker/Majority Leader support</li>
                    <li><strong>Crisis response</strong> - Addresses urgent problems</li>
                    <li><strong>Simple scope</strong> - Focused, not overly complex</li>
                  </ul>
                </div>
                
                <div style={{ padding: 20, background: "#fef2f2", borderRadius: 8, border: "2px solid #ef4444" }}>
                  <h4>❌ Failure Factors</h4>
                  <ul>
                    <li><strong>Partisan divide</strong> - Only one party supports</li>
                    <li><strong>High cost</strong> - Expensive without clear funding</li>
                    <li><strong>Interest group opposition</strong> - Powerful lobbies against</li>
                    <li><strong>Constitutional concerns</strong> - Legal challenges likely</li>
                    <li><strong>Election year politics</strong> - Controversial during campaigns</li>
                  </ul>
                </div>
              </div>

              <div style={{ background: "#fef3c7", padding: 15, borderRadius: 8, border: "1px solid #f59e0b" }}>
                <p><strong>📊 Statistical Reality:</strong> Only about 4% of introduced bills become law. Most die in committee without ever getting a vote!</p>
              </div>
            </div>
          )
        }
      ]
    },

    quiz: {
      title: "📝 Test Your Knowledge",
      description: "Interactive quiz to test what you've learned about Congress",
      steps: [] // Quiz is handled separately
    },

    workshop: {
      title: "🔍 Bill Analysis Workshop",
      description: "Learn to analyze real congressional bills step-by-step",
      steps: [] // Workshop is handled separately
    },

    caseStudies: {
      title: "📚 Historical Case Studies",
      description: "Learn from major legislation throughout history",
      steps: [] // Case studies are handled separately
    }
  };

  const currentTutorialData = tutorials[currentTutorial];
  const currentStepData = currentTutorialData.steps[currentStep];
  const isLastStep = currentStep === currentTutorialData.steps.length - 1;
  const isFirstStep = currentStep === 0;

  const nextStep = () => {
    if (!isLastStep) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  const selectTutorial = (tutorialKey) => {
    if (tutorialKey === "quiz") {
      setShowQuiz(true);
      setShowWorkshop(false);
      setShowCaseStudies(false);
      return;
    }
    if (tutorialKey === "workshop") {
      setShowWorkshop(true);
      setShowQuiz(false);
      setShowCaseStudies(false);
      return;
    }
    if (tutorialKey === "caseStudies") {
      setShowCaseStudies(true);
      setShowQuiz(false);
      setShowWorkshop(false);
      return;
    }
    setCurrentTutorial(tutorialKey);
    setCurrentStep(0);
    setShowQuiz(false);
    setShowWorkshop(false);
    setShowCaseStudies(false);
  };

  const handleQuizComplete = (score, total) => {
    setShowQuiz(false);
    
    // Award achievements based on score
    const percentage = (score / total) * 100;
    if (percentage === 100) {
      if (unlockAchievement(ACHIEVEMENTS.PERFECT_SCORE.id)) {
        setNewAchievement(ACHIEVEMENTS.PERFECT_SCORE);
      }
    } else if (percentage >= 80) {
      if (unlockAchievement(ACHIEVEMENTS.QUIZ_MASTER.id)) {
        setNewAchievement(ACHIEVEMENTS.QUIZ_MASTER);
      }
    }
  };

  const handleTutorialComplete = (tutorialKey) => {
    // Award achievements for completing tutorials
    let achievement = null;
    
    if (achievements.length === 0) {
      achievement = ACHIEVEMENTS.FIRST_TUTORIAL;
    }
    
    switch (tutorialKey) {
      case 'overview':
        achievement = ACHIEVEMENTS.CONGRESS_EXPERT;
        break;
      case 'billTypes':
        achievement = ACHIEVEMENTS.BILL_SCHOLAR;
        break;
      default:
        // No specific achievement for other tutorial types
        break;
    }
    
    if (achievement && unlockAchievement(achievement.id)) {
      setNewAchievement(achievement);
    }
  };

  if (showQuiz) {
    return (
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setShowQuiz(false)}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#374151",
              cursor: "pointer",
              fontWeight: 500
            }}
          >
            ← Back to Tutorials
          </button>
        </div>
        <CivicsQuiz onComplete={handleQuizComplete} />
      </div>
    );
  }

  if (showWorkshop) {
    return (
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setShowWorkshop(false)}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#374151",
              cursor: "pointer",
              fontWeight: 500
            }}
          >
            ← Back to Tutorials
          </button>
        </div>
        <BillAnalysisWorkshop />
      </div>
    );
  }

  if (showCaseStudies) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setShowCaseStudies(false)}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#374151",
              cursor: "pointer",
              fontWeight: 500
            }}
          >
            ← Back to Tutorials
          </button>
        </div>
        <HistoricalCaseStudies />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          🎓 Learn About Congress
        </h1>
        <p style={{ fontSize: 18, color: "#6b7280" }}>
          Interactive tutorials and quizzes to understand how the U.S. legislative process works
        </p>
      </div>

      {/* Tutorial Selection */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginBottom: 30 }}>
        {Object.entries(tutorials).map(([key, tutorial]) => (
          <div
            key={key}
            onClick={() => selectTutorial(key)}
            style={{
              padding: 20,
              border: currentTutorial === key ? "2px solid #2563eb" : "1px solid #e5e7eb",
              borderRadius: 12,
              background: currentTutorial === key ? "#eff6ff" : "white",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 600 }}>
              {tutorial.title}
            </h3>
            <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
              {tutorial.description}
            </p>
            <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>
              {tutorial.steps.length} steps
            </div>
          </div>
        ))}
      </div>

      {/* Tutorial Content */}
      <div style={{ 
        background: "white", 
        border: "1px solid #e5e7eb", 
        borderRadius: 12, 
        overflow: "hidden",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
      }}>
        {/* Progress Bar */}
        <div style={{ background: "#f8fafc", padding: "15px 20px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
              {currentTutorialData.title}
            </h2>
            <span style={{ fontSize: 14, color: "#6b7280" }}>
              Step {currentStep + 1} of {currentTutorialData.steps.length}
            </span>
          </div>
          
          <div style={{ background: "#e5e7eb", height: 6, borderRadius: 3, overflow: "hidden" }}>
            <div 
              style={{ 
                background: "#2563eb", 
                height: "100%", 
                width: `${((currentStep + 1) / currentTutorialData.steps.length) * 100}%`,
                transition: "width 0.3s ease"
              }} 
            />
          </div>
        </div>

        {/* Step Content */}
        <div style={{ padding: 30 }}>
          <h2 style={{ margin: "0 0 20px 0", fontSize: 24, fontWeight: 600, color: "#1f2937" }}>
            {currentStepData.title}
          </h2>
          
          <div style={{ fontSize: 16, lineHeight: 1.6, color: "#374151" }}>
            {currentStepData.content}
          </div>
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
            disabled={isFirstStep}
            style={{
              padding: "10px 20px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: isFirstStep ? "#f9fafb" : "white",
              color: isFirstStep ? "#9ca3af" : "#374151",
              cursor: isFirstStep ? "not-allowed" : "pointer",
              fontWeight: 500
            }}
          >
            ← Previous
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            {currentTutorialData.steps.map((_, index) => (
              <div
                key={index}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: index <= currentStep ? "#2563eb" : "#e5e7eb"
                }}
              />
            ))}
          </div>

          <button
            onClick={() => {
              if (isLastStep) {
                handleTutorialComplete(currentTutorial);
              } else {
                nextStep();
              }
            }}
            disabled={false}
            style={{
              padding: "10px 20px",
              borderRadius: 6,
              border: "none",
              background: isLastStep ? "#10b981" : "#2563eb",
              color: "white",
              cursor: "pointer",
              fontWeight: 500
            }}
          >
            {isLastStep ? "Complete Tutorial!" : "Next →"}
          </button>
        </div>
      </div>

      {/* Quick Links */}
      {isLastStep && (
        <div style={{ 
          marginTop: 30, 
          padding: 20, 
          background: "#ecfdf5", 
          border: "1px solid #10b981", 
          borderRadius: 12 
        }}>
          <h3 style={{ margin: "0 0 15px 0", color: "#065f46" }}>
            🎉 Tutorial Complete! What's Next?
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 15 }}>
            <button
              onClick={() => window.location.href = "/betting"}
              style={{
                padding: "12px 16px",
                borderRadius: 6,
                border: "1px solid #10b981",
                background: "white",
                color: "#065f46",
                cursor: "pointer",
                textAlign: "left"
              }}
            >
              <div style={{ fontWeight: 600 }}>📊 Practice Predictions</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Apply your knowledge to real bills</div>
            </button>
            
            <button
              onClick={() => selectTutorial("billTypes")}
              style={{
                padding: "12px 16px",
                borderRadius: 6,
                border: "1px solid #10b981",
                background: "white",
                color: "#065f46",
                cursor: "pointer",
                textAlign: "left"
              }}
            >
              <div style={{ fontWeight: 600 }}>📚 Bill Types Tutorial</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Learn about different legislation types</div>
            </button>
            
            <button
              onClick={() => selectTutorial("predictions")}
              style={{
                padding: "12px 16px",
                borderRadius: 6,
                border: "1px solid #10b981",
                background: "white",
                color: "#065f46",
                cursor: "pointer",
                textAlign: "left"
              }}
            >
              <div style={{ fontWeight: 600 }}>🎯 Prediction Skills</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Learn to analyze bill success factors</div>
            </button>
            
            <button
              onClick={() => selectTutorial("workshop")}
              style={{
                padding: "12px 16px",
                borderRadius: 6,
                border: "1px solid #10b981",
                background: "white",
                color: "#065f46",
                cursor: "pointer",
                textAlign: "left"
              }}
            >
              <div style={{ fontWeight: 600 }}>🔍 Bill Analysis Workshop</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Practice analyzing real bills</div>
            </button>
            
            <button
              onClick={() => selectTutorial("caseStudies")}
              style={{
                padding: "12px 16px",
                borderRadius: 6,
                border: "1px solid #10b981",
                background: "white",
                color: "#065f46",
                cursor: "pointer",
                textAlign: "left"
              }}
            >
              <div style={{ fontWeight: 600 }}>📚 Historical Case Studies</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Learn from major legislation throughout history</div>
            </button>
            
            <button
              onClick={() => selectTutorial("quiz")}
              style={{
                padding: "12px 16px",
                borderRadius: 6,
                border: "1px solid #10b981",
                background: "white",
                color: "#065f46",
                cursor: "pointer",
                textAlign: "left"
              }}
            >
              <div style={{ fontWeight: 600 }}>📝 Test Your Knowledge</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Interactive civics quiz</div>
            </button>
          </div>
        </div>
      )}

      {/* Achievement Panel */}
      <AchievementPanel achievements={achievements} />

      {/* Achievement Notification */}
      {newAchievement && (
        <AchievementNotification 
          achievement={newAchievement}
          onClose={() => setNewAchievement(null)}
        />
      )}
    </div>
  );
}