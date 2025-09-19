---
inclusion: fileMatch
fileMatchPattern: '**/ingest*.py'
---

# Data Quality Standards

## Data Source Reliability

### Primary Sources (Tier 1)
- **Congress.gov API**: Official legislative data with high reliability
- **GovInfo API**: Structured USLM XML with comprehensive metadata
- **House/Senate Clerk**: Official vote records and procedural data
- **Congressional Record**: Official proceedings and statements

### Secondary Sources (Tier 2)
- **Committee Websites**: Hearing schedules and markup information
- **Member Websites**: Press releases and position statements
- **CRS Reports**: Congressional Research Service analysis
- **GAO Reports**: Government Accountability Office studies

### Validation Requirements
- Cross-reference data across multiple sources when possible
- Implement checksums for critical data integrity
- Maintain source attribution for all ingested data
- Regular audits of data accuracy and completeness

## Data Freshness Standards

### Real-time Data (< 5 minutes)
- House and Senate floor votes
- Committee markup results
- Breaking news affecting markets
- Emergency legislative actions

### Near Real-time Data (< 1 hour)
- Bill introductions and updates
- Committee hearing schedules
- Member statements and press releases
- Lobbying disclosure filings

### Daily Batch Updates
- Bill text and summary updates
- Member biographical information
- Committee membership changes
- Historical vote analysis

### Weekly Comprehensive Updates
- Full database reconciliation
- Data quality metrics review
- Source reliability assessment
- Performance optimization

## Data Validation Pipeline

### Ingestion Validation
```python
def validate_bill_data(bill_data):
    required_fields = ['congress', 'bill_type', 'bill_number', 'title']
    
    # Check required fields
    for field in required_fields:
        if not bill_data.get(field):
            raise ValidationError(f"Missing required field: {field}")
    
    # Validate data types and formats
    if not isinstance(bill_data['congress'], int) or bill_data['congress'] < 1:
        raise ValidationError("Invalid congress number")
    
    if bill_data['bill_type'] not in VALID_BILL_TYPES:
        raise ValidationError(f"Invalid bill type: {bill_data['bill_type']}")
    
    # Check for data consistency
    if bill_data.get('introduced_date'):
        if not is_valid_date(bill_data['introduced_date']):
            raise ValidationError("Invalid introduced date format")
    
    return True
```

### Quality Scoring System
- **Completeness Score**: Percentage of required fields populated
- **Accuracy Score**: Validation against authoritative sources
- **Freshness Score**: Time since last update relative to source
- **Consistency Score**: Agreement across multiple sources

### Error Handling Procedures
- Automatic retry with exponential backoff for transient failures
- Dead letter queue for persistent failures requiring manual review
- Alert system for data quality degradation
- Rollback procedures for corrupted data batches

## Performance Standards

### Ingestion Throughput
- **Bills**: 1,000 bills per hour during bulk operations
- **Votes**: 50 roll call votes per minute during active sessions
- **Members**: Complete member database refresh in <30 minutes
- **Text**: 100 bill texts per hour with full processing

### Storage Efficiency
- Compress historical data older than 2 years
- Implement data archiving for completed congresses
- Use appropriate indexing for query performance
- Regular cleanup of temporary and staging data

### Query Performance
- Bill searches: <200ms for 95th percentile
- Vote lookups: <100ms for individual votes
- Member profiles: <150ms including recent activity
- Market data: <50ms for real-time price feeds

## Data Retention Policies

### Active Data (Current Congress)
- **Retention**: Indefinite for current legislative session
- **Backup**: Daily incremental, weekly full backups
- **Replication**: Real-time replication to secondary database
- **Access**: Full read/write access for applications

### Historical Data (Previous Congresses)
- **Retention**: Permanent retention for historical analysis
- **Backup**: Monthly full backups to cold storage
- **Compression**: Aggressive compression for storage efficiency
- **Access**: Read-only access with longer query times acceptable

### Temporary Data
- **Processing Logs**: 90 days retention
- **Cache Data**: 24-48 hours depending on type
- **Session Data**: 30 days for user sessions
- **Error Logs**: 1 year for debugging and analysis

## Monitoring and Alerting

### Data Quality Metrics
- Daily data completeness reports
- Source reliability trending
- Processing error rates
- User-reported data issues

### Alert Thresholds
- >5% increase in validation failures
- >10% decrease in data completeness scores
- >30 minutes delay in critical data updates
- Any complete source failure lasting >15 minutes

### Recovery Procedures
- Automated failover to backup data sources
- Manual data correction procedures
- Communication protocols for user-facing issues
- Post-incident analysis and improvement processes