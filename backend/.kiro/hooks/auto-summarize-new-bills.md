# Auto-Summarize New Bills Hook

## Trigger
When new bills are ingested into the database (via the bill ingestion process)

## Description
Automatically generate AI summaries for newly introduced bills to keep the platform current with fresh legislative content.

## Execution Logic

### 1. Detection Phase
- Monitor the `bills` table for new insertions
- Filter for bills introduced within the last 24 hours
- Prioritize bills from key committees or high-profile sponsors
- Skip bills that already have summaries

### 2. Prioritization Algorithm
```python
def calculate_priority(bill):
    priority = 0
    
    # High-priority committees
    if bill.committee in ['Ways and Means', 'Appropriations', 'Judiciary']:
        priority += 50
    
    # Sponsor influence (based on historical data)
    priority += bill.sponsor_influence_score
    
    # Bill type importance
    if bill.type in ['hr', 's']:  # Regular bills vs resolutions
        priority += 30
    
    # Recent activity
    if bill.days_since_introduction < 1:
        priority += 20
    
    return priority
```

### 3. Summary Generation
- Use BillPlainSummarizer for structured analysis
- Generate both technical and plain-English summaries
- Extract key financial figures and deadlines
- Identify potential betting market opportunities

### 4. Quality Assurance
- Validate summary completeness and accuracy
- Check for appropriate length and formatting
- Ensure all required sections are present
- Flag summaries that may need human review

### 5. Notification System
- Alert platform administrators of new summaries
- Notify users who have subscribed to specific topics
- Update betting market creators about new opportunities
- Post to internal Slack channel for team awareness

## Configuration

### Execution Schedule
- **Frequency**: Every 2 hours during business days
- **Batch Size**: Maximum 10 bills per execution
- **Timeout**: 5 minutes per bill summary
- **Retry Logic**: 3 attempts with exponential backoff

### Resource Limits
- **OpenAI API**: Maximum 50 requests per hour
- **Memory**: 2GB limit per execution
- **CPU**: Medium priority to avoid impacting user requests
- **Storage**: Summaries stored in dedicated S3 bucket

### Error Handling
- Log all failures with detailed error messages
- Send alerts for consecutive failures (>3)
- Maintain fallback queue for failed summaries
- Generate basic summaries if AI analysis fails

## Success Metrics
- **Coverage**: 95% of new bills summarized within 6 hours
- **Quality**: Average user rating >4.0/5.0 for summaries
- **Performance**: <2 minutes average generation time
- **Reliability**: <5% failure rate for summary generation

## Manual Override
Platform administrators can:
- Force immediate summary generation for specific bills
- Adjust priority scoring parameters
- Pause automatic execution during maintenance
- Review and edit generated summaries before publication

## Integration Points
- **Database**: Direct integration with bills and summaries tables
- **AI Service**: BillPlainSummarizer and BillTextScraper
- **Notification**: Email, Slack, and in-app notifications
- **Monitoring**: CloudWatch metrics and alerts