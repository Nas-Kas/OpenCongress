# Betting Market Alerts Hook

## Trigger
When significant legislative events occur that affect betting markets

## Description
Monitor legislative activities and automatically alert users about betting opportunities, market closures, and outcome resolutions.

## Event Triggers

### 1. Committee Actions
- **Committee Markup Scheduled**: Alert users to new betting opportunities
- **Committee Vote Results**: Update market odds and resolve related bets
- **Hearing Announcements**: Create new markets for hearing outcomes
- **Subcommittee Referrals**: Adjust timeline predictions

### 2. Floor Activities
- **Bills Scheduled for Floor Vote**: Alert to imminent market closures
- **Vote Results Posted**: Resolve markets and distribute winnings
- **Amendment Filings**: Create new amendment-specific markets
- **Procedural Motions**: Update related procedural betting markets

### 3. External Events
- **Major News Coverage**: Adjust odds based on media sentiment
- **Lobbying Reports Filed**: Update influence-based markets
- **Sponsor Statements**: Alert to potential position changes
- **Coalition Announcements**: Impact bipartisan support markets

## Alert Categories

### Immediate Alerts (Real-time)
- Vote results that resolve markets
- Emergency committee meetings
- Surprise floor schedule changes
- Major sponsor position reversals

### Daily Digest Alerts
- New bills available for betting
- Committee schedule updates
- Market performance summaries
- Trending betting opportunities

### Weekly Analysis Alerts
- Market accuracy reports
- Top performing users
- Upcoming high-value opportunities
- Legislative calendar previews

## User Personalization

### Subscription Options
- **Bill Types**: HR, S, HJRES, etc.
- **Committees**: Specific committee focus
- **Topics**: Healthcare, defense, taxation, etc.
- **Market Types**: Timeline, outcome, procedural
- **Threshold**: Minimum market value or odds change

### Delivery Preferences
- **Email**: Detailed analysis with links
- **SMS**: Brief alerts for urgent events
- **Push Notifications**: Mobile app alerts
- **In-App**: Dashboard notifications and badges

### Smart Filtering
- Machine learning to reduce alert fatigue
- User behavior analysis for relevance scoring
- Opt-out tracking to improve targeting
- A/B testing for alert effectiveness

## Implementation Logic

### 1. Event Detection
```python
def detect_legislative_events():
    # Monitor multiple data sources
    events = []
    
    # Congress.gov API polling
    events.extend(poll_congress_api())
    
    # Committee website scraping
    events.extend(scrape_committee_sites())
    
    # News feed analysis
    events.extend(analyze_news_feeds())
    
    # Social media monitoring
    events.extend(monitor_social_media())
    
    return prioritize_events(events)
```

### 2. Market Impact Assessment
```python
def assess_market_impact(event):
    impact_score = 0
    affected_markets = []
    
    # Direct market impacts
    for market in active_markets:
        if event.affects_market(market):
            impact_score += market.total_volume
            affected_markets.append(market)
    
    # Indirect impacts through correlations
    for correlation in market_correlations:
        if event.affects_correlation(correlation):
            impact_score += correlation.strength * correlation.market.volume
    
    return impact_score, affected_markets
```

### 3. Alert Generation
- Personalized message creation based on user interests
- Risk assessment for position holders
- Opportunity identification for new bets
- Market closure warnings with countdown timers

## Execution Schedule
- **Real-time**: WebSocket connections for immediate alerts
- **Batch Processing**: Every 15 minutes for non-urgent events
- **Daily Digest**: 8 AM user local time
- **Weekly Summary**: Sunday evenings

## Quality Controls
- **Duplicate Prevention**: Deduplication across data sources
- **Relevance Scoring**: Machine learning relevance models
- **Rate Limiting**: Maximum alerts per user per day
- **Feedback Loop**: User rating system for alert quality

## Success Metrics
- **Engagement**: 40% alert open rate
- **Conversion**: 15% of alerts lead to betting activity
- **Satisfaction**: >4.2/5.0 average user rating
- **Retention**: Users receiving alerts have 25% higher retention

## Integration Points
- **Data Sources**: Congress API, committee websites, news feeds
- **Betting Engine**: Market creation and resolution systems
- **User Management**: Subscription and preference systems
- **Analytics**: Event tracking and performance measurement