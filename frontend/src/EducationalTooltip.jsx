import { useState } from "react";

export default function EducationalTooltip({ children, title, content, position = "top" }) {
  const [isVisible, setIsVisible] = useState(false);

  const getPositionClasses = () => {
    switch (position) {
      case "top":
        return "bottom-full left-1/2 -translate-x-1/2 mb-2";
      case "bottom":
        return "top-full left-1/2 -translate-x-1/2 mt-2";
      case "right":
        return "left-full top-1/2 -translate-y-1/2 ml-2";
      case "left":
        return "right-full top-1/2 -translate-y-1/2 mr-2";
      default:
        return "bottom-full left-1/2 -translate-x-1/2 mb-2";
    }
  };

  const getArrowClasses = () => {
    switch (position) {
      case "top":
        return "top-full left-1/2 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-800";
      case "bottom":
        return "bottom-full left-1/2 -translate-x-1/2 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-800";
      case "right":
        return "right-full top-1/2 -translate-y-1/2 border-t-[6px] border-b-[6px] border-r-[6px] border-t-transparent border-b-transparent border-r-gray-800";
      case "left":
        return "left-full top-1/2 -translate-y-1/2 border-t-[6px] border-b-[6px] border-l-[6px] border-t-transparent border-b-transparent border-l-gray-800";
      default:
        return "top-full left-1/2 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-800";
    }
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}

      {isVisible && (
        <div className={`absolute z-[1000] bg-gray-800 text-white px-4 py-3 rounded-lg text-sm leading-relaxed max-w-xs shadow-lg border border-gray-600 ${getPositionClasses()}`}>
          <div className={`absolute w-0 h-0 ${getArrowClasses()}`} />
          {title && (
            <div className="font-semibold mb-1.5 text-yellow-400">
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