import { useState, useEffect } from "react";

// Simple achievement system using localStorage
export const useAchievements = () => {
  const [achievements, setAchievements] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('civics_achievements');
    if (saved) {
      setAchievements(JSON.parse(saved));
    }
  }, []);

  const unlockAchievement = (achievementId) => {
    const newAchievements = [...achievements];
    if (!newAchievements.includes(achievementId)) {
      newAchievements.push(achievementId);
      setAchievements(newAchievements);
      localStorage.setItem('civics_achievements', JSON.stringify(newAchievements));
      return true; // New achievement unlocked
    }
    return false; // Already had this achievement
  };

  const hasAchievement = (achievementId) => {
    return achievements.includes(achievementId);
  };

  return { achievements, unlockAchievement, hasAchievement };
};

export const ACHIEVEMENTS = {
  FIRST_TUTORIAL: {
    id: 'first_tutorial',
    title: '🎓 First Steps',
    description: 'Completed your first tutorial',
    icon: '🎓'
  },
  CONGRESS_EXPERT: {
    id: 'congress_expert',
    title: '🏛️ Congress Expert',
    description: 'Completed the How Congress Works tutorial',
    icon: '🏛️'
  },
  BILL_SCHOLAR: {
    id: 'bill_scholar',
    title: '📜 Bill Scholar',
    description: 'Completed the Bill Types tutorial',
    icon: '📜'
  },
  QUIZ_MASTER: {
    id: 'quiz_master',
    title: '🧠 Quiz Master',
    description: 'Scored 80% or higher on the civics quiz',
    icon: '🧠'
  },
  PERFECT_SCORE: {
    id: 'perfect_score',
    title: '⭐ Perfect Score',
    description: 'Got 100% on the civics quiz',
    icon: '⭐'
  },
  ANALYST: {
    id: 'analyst',
    title: '🔍 Bill Analyst',
    description: 'Completed a bill analysis workshop',
    icon: '🔍'
  },
  PREDICTOR: {
    id: 'predictor',
    title: '🎯 Political Predictor',
    description: 'Made your first prediction in the markets',
    icon: '🎯'
  },
  SCHOLAR: {
    id: 'scholar',
    title: '📚 Civics Scholar',
    description: 'Completed all tutorials and quiz',
    icon: '📚'
  }
};

export function AchievementNotification({ achievement, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      right: 20,
      zIndex: 1000,
      background: 'linear-gradient(135deg, #10b981, #059669)',
      color: 'white',
      padding: '16px 20px',
      borderRadius: 12,
      boxShadow: '0 8px 25px rgba(16, 185, 129, 0.3)',
      maxWidth: 300,
      animation: 'slideIn 0.3s ease-out'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 24 }}>{achievement.icon}</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Achievement Unlocked!</div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>{achievement.title}</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{achievement.description}</div>
        </div>
      </div>
      
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'none',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontSize: 16,
          opacity: 0.7
        }}
      >
        ×
      </button>
    </div>
  );
}

export function AchievementBadge({ achievement, unlocked = false, size = 'medium' }) {
  const sizeStyles = {
    small: { width: 40, height: 40, fontSize: 16 },
    medium: { width: 60, height: 60, fontSize: 24 },
    large: { width: 80, height: 80, fontSize: 32 }
  };

  return (
    <div
      style={{
        ...sizeStyles[size],
        borderRadius: '50%',
        background: unlocked 
          ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' 
          : '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: unlocked ? 'white' : '#9ca3af',
        fontWeight: 600,
        boxShadow: unlocked ? '0 4px 12px rgba(251, 191, 36, 0.3)' : 'none',
        transition: 'all 0.2s',
        cursor: 'pointer'
      }}
      title={`${achievement.title}: ${achievement.description}`}
    >
      {achievement.icon}
    </div>
  );
}

export function AchievementPanel({ achievements }) {
  const { hasAchievement } = useAchievements();
  
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      padding: 20,
      marginTop: 20
    }}>
      <h3 style={{ margin: '0 0 15px 0', fontSize: 18, fontWeight: 600 }}>
        🏆 Your Achievements
      </h3>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', 
        gap: 15,
        marginBottom: 15
      }}>
        {Object.values(ACHIEVEMENTS).map(achievement => (
          <div key={achievement.id} style={{ textAlign: 'center' }}>
            <AchievementBadge 
              achievement={achievement} 
              unlocked={hasAchievement(achievement.id)}
              size="large"
            />
            <div style={{ 
              fontSize: 12, 
              marginTop: 8, 
              color: hasAchievement(achievement.id) ? '#374151' : '#9ca3af',
              fontWeight: hasAchievement(achievement.id) ? 600 : 400
            }}>
              {achievement.title}
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
        {achievements.length} of {Object.keys(ACHIEVEMENTS).length} achievements unlocked
      </div>
    </div>
  );
}