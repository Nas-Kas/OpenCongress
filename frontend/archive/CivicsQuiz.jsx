import { useState } from "react";

export default function CivicsQuiz({ onComplete }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);

  const questions = [
    {
      id: 1,
      question: "What percentage of introduced bills typically become law?",
      options: [
        "About 25%",
        "About 15%", 
        "About 4%",
        "About 50%"
      ],
      correct: 2,
      explanation: "Only about 4% of introduced bills become law. Most bills die in committee without ever receiving a floor vote."
    },
    {
      id: 2,
      question: "Which chamber must originate all tax/revenue bills?",
      options: [
        "Senate",
        "House of Representatives",
        "Either chamber",
        "Supreme Court"
      ],
      correct: 1,
      explanation: "The Constitution requires all revenue bills to originate in the House of Representatives, reflecting the founders' belief that taxation should be closest to the people."
    },
    {
      id: 3,
      question: "How many votes are typically needed to pass legislation in the Senate?",
      options: [
        "51 votes (simple majority)",
        "60 votes (to overcome filibuster)",
        "67 votes (supermajority)",
        "100 votes (unanimous)"
      ],
      correct: 1,
      explanation: "While 51 votes is technically a majority, the filibuster rule means most legislation needs 60 votes to end debate and proceed to a vote."
    },
    {
      id: 4,
      question: "What happens in committee markup?",
      options: [
        "Bills are printed and distributed",
        "Bills are debated, amended, and voted on",
        "Bills are sent to the President",
        "Bills are assigned numbers"
      ],
      correct: 1,
      explanation: "Committee markup is where the real work happens - members debate the bill's merits, propose amendments, and vote on whether to send it to the floor."
    },
    {
      id: 5,
      question: "Which factor most increases a bill's chance of becoming law?",
      options: [
        "Having a high bill number",
        "Being very long and detailed",
        "Having bipartisan support",
        "Being introduced on Monday"
      ],
      correct: 2,
      explanation: "Bipartisan support dramatically increases a bill's chances. Bills with sponsors from both parties are much more likely to navigate the legislative process successfully."
    },
    {
      id: 6,
      question: "What is a 'pocket veto'?",
      options: [
        "When the President vetoes a bill privately",
        "When Congress overrides a veto",
        "When a bill dies because Congress adjourns before the President signs it",
        "When a bill is too small to matter"
      ],
      correct: 2,
      explanation: "A pocket veto occurs when Congress adjourns within 10 days of sending a bill to the President and the President doesn't sign it - the bill automatically dies."
    }
  ];

  const handleAnswerSelect = (questionIndex, answerIndex) => {
    setSelectedAnswers({
      ...selectedAnswers,
      [questionIndex]: answerIndex
    });
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      // Calculate score and show results
      let correctCount = 0;
      questions.forEach((q, index) => {
        if (selectedAnswers[index] === q.correct) {
          correctCount++;
        }
      });
      setScore(correctCount);
      setShowResults(true);
    }
  };

  const handleRestart = () => {
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setShowResults(false);
    setScore(0);
  };

  const getScoreMessage = (score, total) => {
    const percentage = (score / total) * 100;
    if (percentage >= 90) return { message: "🎉 Excellent! You're a civics expert!", color: "#10b981" };
    if (percentage >= 70) return { message: "👏 Great job! You understand the basics well.", color: "#3b82f6" };
    if (percentage >= 50) return { message: "👍 Good start! Review the tutorials for better understanding.", color: "#f59e0b" };
    return { message: "📚 Keep learning! The tutorials will help you improve.", color: "#ef4444" };
  };

  if (showResults) {
    const scoreMessage = getScoreMessage(score, questions.length);
    
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
        <div style={{ 
          background: "white", 
          border: "1px solid #e5e7eb", 
          borderRadius: 12, 
          padding: 30,
          textAlign: "center"
        }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>
            Quiz Complete!
          </h2>
          
          <div style={{ 
            fontSize: 48, 
            fontWeight: 700, 
            color: scoreMessage.color,
            marginBottom: 15
          }}>
            {score}/{questions.length}
          </div>
          
          <p style={{ 
            fontSize: 18, 
            color: scoreMessage.color, 
            fontWeight: 600,
            marginBottom: 25
          }}>
            {scoreMessage.message}
          </p>

          {/* Review incorrect answers */}
          <div style={{ textAlign: "left", marginBottom: 25 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 15 }}>Review:</h3>
            {questions.map((q, index) => {
              const userAnswer = selectedAnswers[index];
              const isCorrect = userAnswer === q.correct;
              
              return (
                <div key={q.id} style={{ 
                  marginBottom: 15, 
                  padding: 15, 
                  background: isCorrect ? "#ecfdf5" : "#fef2f2",
                  border: `1px solid ${isCorrect ? "#10b981" : "#ef4444"}`,
                  borderRadius: 8
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    {isCorrect ? "✅" : "❌"} Question {index + 1}
                  </div>
                  <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
                    {q.question}
                  </div>
                  {!isCorrect && (
                    <div style={{ fontSize: 14 }}>
                      <div style={{ color: "#ef4444" }}>
                        Your answer: {q.options[userAnswer]}
                      </div>
                      <div style={{ color: "#10b981" }}>
                        Correct: {q.options[q.correct]}
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8, fontStyle: "italic" }}>
                    {q.explanation}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 15, justifyContent: "center" }}>
            <button
              onClick={handleRestart}
              style={{
                padding: "12px 24px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "white",
                color: "#374151",
                cursor: "pointer",
                fontWeight: 500
              }}
            >
              Retake Quiz
            </button>
            
            <button
              onClick={() => onComplete?.(score, questions.length)}
              style={{
                padding: "12px 24px",
                borderRadius: 6,
                border: "none",
                background: "#2563eb",
                color: "white",
                cursor: "pointer",
                fontWeight: 500
              }}
            >
              Continue Learning
            </button>
          </div>
        </div>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const selectedAnswer = selectedAnswers[currentQuestion];
  const canProceed = selectedAnswer !== undefined;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <div style={{ 
        background: "white", 
        border: "1px solid #e5e7eb", 
        borderRadius: 12, 
        overflow: "hidden"
      }}>
        {/* Progress Bar */}
        <div style={{ background: "#f8fafc", padding: "15px 20px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
              📝 Civics Knowledge Quiz
            </h2>
            <span style={{ fontSize: 14, color: "#6b7280" }}>
              Question {currentQuestion + 1} of {questions.length}
            </span>
          </div>
          
          <div style={{ background: "#e5e7eb", height: 6, borderRadius: 3, overflow: "hidden" }}>
            <div 
              style={{ 
                background: "#2563eb", 
                height: "100%", 
                width: `${((currentQuestion + 1) / questions.length) * 100}%`,
                transition: "width 0.3s ease"
              }} 
            />
          </div>
        </div>

        {/* Question */}
        <div style={{ padding: 30 }}>
          <h3 style={{ 
            fontSize: 20, 
            fontWeight: 600, 
            marginBottom: 25,
            lineHeight: 1.4
          }}>
            {question.question}
          </h3>

          {/* Answer Options */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {question.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswerSelect(currentQuestion, index)}
                style={{
                  padding: "15px 20px",
                  borderRadius: 8,
                  border: selectedAnswer === index ? "2px solid #2563eb" : "1px solid #e5e7eb",
                  background: selectedAnswer === index ? "#eff6ff" : "white",
                  color: "#374151",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 16,
                  transition: "all 0.2s"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: selectedAnswer === index ? "2px solid #2563eb" : "2px solid #d1d5db",
                    background: selectedAnswer === index ? "#2563eb" : "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    {selectedAnswer === index && (
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white" }} />
                    )}
                  </div>
                  {option}
                </div>
              </button>
            ))}
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
          <div style={{ fontSize: 14, color: "#6b7280" }}>
            Select an answer to continue
          </div>

          <button
            onClick={handleNext}
            disabled={!canProceed}
            style={{
              padding: "10px 20px",
              borderRadius: 6,
              border: "none",
              background: canProceed ? "#2563eb" : "#e5e7eb",
              color: canProceed ? "white" : "#9ca3af",
              cursor: canProceed ? "pointer" : "not-allowed",
              fontWeight: 500
            }}
          >
            {currentQuestion === questions.length - 1 ? "Finish Quiz" : "Next Question"}
          </button>
        </div>
      </div>
    </div>
  );
}