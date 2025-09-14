import { useState } from "react";

export default function EducationalTooltip({ children, title, content, position = "top" }) {
  const [isVisible, setIsVisible] = useState(false);

  const tooltipStyle = {
    position: "absolute",
    zIndex: 1000,
    background: "#1f2937",
    color: "white",
    padding: "12px 16px",
    borderRadius: 8,
    fontSize: 14,
    lineHeight: 1.4,
    maxWidth: 300,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    border: "1px solid #374151",
    ...(position === "top" && {
      bottom: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      marginBottom: 8
    }),
    ...(position === "bottom" && {
      top: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      marginTop: 8
    }),
    ...(position === "right" && {
      left: "100%",
      top: "50%",
      transform: "translateY(-50%)",
      marginLeft: 8
    }),
    ...(position === "left" && {
      right: "100%",
      top: "50%",
      transform: "translateY(-50%)",
      marginRight: 8
    })
  };

  const arrowStyle = {
    position: "absolute",
    width: 0,
    height: 0,
    ...(position === "top" && {
      top: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      borderLeft: "6px solid transparent",
      borderRight: "6px solid transparent",
      borderTop: "6px solid #1f2937"
    }),
    ...(position === "bottom" && {
      bottom: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      borderLeft: "6px solid transparent",
      borderRight: "6px solid transparent",
      borderBottom: "6px solid #1f2937"
    }),
    ...(position === "right" && {
      right: "100%",
      top: "50%",
      transform: "translateY(-50%)",
      borderTop: "6px solid transparent",
      borderBottom: "6px solid transparent",
      borderRight: "6px solid #1f2937"
    }),
    ...(position === "left" && {
      left: "100%",
      top: "50%",
      transform: "translateY(-50%)",
      borderTop: "6px solid transparent",
      borderBottom: "6px solid transparent",
      borderLeft: "6px solid #1f2937"
    })
  };

  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}

      {isVisible && (
        <div style={tooltipStyle}>
          <div style={arrowStyle} />
          {title && (
            <div style={{ fontWeight: 600, marginBottom: 6, color: "#fbbf24" }}>
              {title}
            </div>
          )}
          <div>{content}</div>
        </div>
      )}
    </div>
  );
}

// Predefined educational tooltips for common political terms
export const PoliticalTermTooltip = ({ term, children }) => {
  const definitions = {
    "bill_passage": {
      title: "📜 Bill Passage",
      content: "Whether a bill will be approved by both chambers of Congress and signed into law by the President. Only about 4% of introduced bills actually become law."
    },
    "member_vote": {
      title: "🗳️ Member Vote Prediction",
      content: "Predicting how individual Congress members will vote. Consider their party affiliation, district preferences, past voting record, and committee positions."
    },
    "vote_count": {
      title: "📊 Vote Count Market",
      content: "Predicting whether a bill will receive more or fewer than a specific number of YES votes. House needs 218+ for passage, but margins vary widely."
    },
    "timeline": {
      title: "⏰ Timeline Prediction",
      content: "When legislation will come up for a vote. Consider committee schedules, leadership priorities, and the legislative calendar."
    },
    "committee": {
      title: "🏛️ Committee System",
      content: "Specialized groups that review bills before floor votes. Most bills die in committee. Committee support is crucial for passage."
    },
    "bipartisan": {
      title: "🤝 Bipartisan Support",
      content: "When both Democrats and Republicans support a bill. Bipartisan bills have much higher success rates than partisan ones."
    },
    "filibuster": {
      title: "🗣️ Senate Filibuster",
      content: "Senate rule allowing unlimited debate. Effectively requires 60 votes to pass most legislation, not just 51."
    },
    "markup": {
      title: "✏️ Committee Markup",
      content: "Process where committees debate, amend, and vote on bills. This is where most changes to legislation happen."
    },
    "cloture": {
      title: "⏱️ Cloture Vote",
      content: "Senate procedure to end debate and proceed to a vote. Requires 60 senators to agree, which is why 60 votes are often needed."
    },
    "reconciliation": {
      title: "💰 Budget Reconciliation",
      content: "Special process for budget-related bills that bypasses the filibuster. Only requires 51 votes in Senate but has strict rules."
    }
  };

  const definition = definitions[term];
  if (!definition) return children;

  return (
    <EducationalTooltip title={definition.title} content={definition.content}>
      {children}
    </EducationalTooltip>
  );
};

// Component for adding educational context to odds
export const OddsExplainer = ({ odds, marketType, children }) => {
  const getOddsExplanation = (odds, marketType) => {
    const probability = (1 / odds * 100).toFixed(0);

    let context = "";
    switch (marketType) {
      case "bill_passage":
        if (odds < 2) context = "High confidence - likely has strong bipartisan support or leadership backing.";
        else if (odds < 4) context = "Moderate chance - probably has some cross-party appeal or addresses urgent need.";
        else context = "Long shot - likely faces significant opposition or procedural hurdles.";
        break;
      case "member_vote":
        if (odds < 2) context = "Strong prediction based on member's party, district, or past voting record.";
        else context = "Uncertain vote - member might be a swing vote or face conflicting pressures.";
        break;
      default:
        context = "Odds reflect the market's collective assessment of likelihood.";
    }

    return `${probability}% implied probability. ${context}`;
  };

  return (
    <EducationalTooltip
      title="🎯 Understanding Odds"
      content={getOddsExplanation(odds, marketType)}
      position="top"
    >
      {children}
    </EducationalTooltip>
  );
};