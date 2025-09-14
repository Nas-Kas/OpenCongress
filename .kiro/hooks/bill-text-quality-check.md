# Bill Text Quality Check Hook

## Trigger
After bill text is scraped and before AI summarization begins

## Description
Automatically validate and improve the quality of scraped bill text to ensure accurate AI analysis and summaries.

## Quality Checks

### 1. Text Completeness
- **Length Validation**: Ensure minimum viable text length (>1000 characters)
- **Section Detection**: Verify presence of standard bill sections
- **Truncation Check**: Detect if text was cut off during scraping
- **Missing Content**: Identify gaps in section numbering or content

### 2. Format Consistency
- **Character Encoding**: Fix encoding issues (UTF-8 normalization)
- **Line Break Standardization**: Normalize line endings and spacing
- **Section Header Format**: Standardize "SEC. X" formatting
- **Special Character Handling**: Clean up PDF artifacts and OCR errors

### 3. Content Accuracy
- **OCR Error Detection**: Identify common OCR mistakes in PDF extractions
- **Legal Citation Validation**: Verify USC and CFR references
- **Date Format Consistency**: Standardize date representations
- **Number Format Validation**: Check monetary amounts and percentages

### 4. Structural Integrity
- **Hierarchy Validation**: Ensure proper section/subsection nesting
- **Cross-Reference Check**: Validate internal bill references
- **Amendment Tracking**: Identify and mark amendatory language
- **Definition Consistency**: Check defined terms usage

## Automated Corrections

### Text Cleaning Pipeline
```python
def clean_bill_text(raw_text):
    # Stage 1: Basic cleanup
    text = normalize_encoding(raw_text)
    text = standardize_line_breaks(text)
    text = remove_pdf_artifacts(text)
    
    # Stage 2: OCR error correction
    text = fix_common_ocr_errors(text)
    text = validate_legal_citations(text)
    text = standardize_dates(text)
    
    # Stage 3: Structural validation
    text = fix_section_numbering(text)
    text = validate_cross_references(text)
    text = mark_amendatory_language(text)
    
    return text
```

### Common OCR Fixes
- "rn" → "m" (common OCR confusion)
- "vv" → "w" (double v to w)
- "1" → "l" in legal contexts
- "0" → "O" in proper nouns
- Restore missing spaces around punctuation

### Legal Citation Validation
- USC references: "42 U.S.C. 1234" format validation
- CFR references: "12 CFR 345.67" format validation
- Public Law references: "Public Law 117-123" validation
- Bill references: "H.R. 1234" or "S. 567" validation

## Quality Scoring

### Scoring Algorithm
```python
def calculate_quality_score(text):
    score = 100  # Start with perfect score
    
    # Deduct for issues
    if len(text) < 5000:
        score -= 20  # Too short
    
    if ocr_error_count(text) > 10:
        score -= 15  # Too many OCR errors
    
    if missing_sections(text):
        score -= 25  # Structural issues
    
    if encoding_issues(text):
        score -= 10  # Character problems
    
    # Bonus for good indicators
    if has_proper_citations(text):
        score += 5
    
    if well_structured(text):
        score += 5
    
    return max(0, min(100, score))
```

### Quality Thresholds
- **Excellent (90-100)**: Ready for AI analysis
- **Good (75-89)**: Minor cleanup needed
- **Fair (60-74)**: Significant cleanup required
- **Poor (<60)**: Manual review needed

## Error Handling

### Automatic Retry Logic
1. **Source Switching**: Try different text sources (PDF → HTML → API)
2. **Parameter Adjustment**: Modify scraping parameters for better results
3. **Alternative Methods**: Use backup extraction methods
4. **Manual Queue**: Flag for human review if all automated methods fail

### Fallback Strategies
- Use partial text if complete text unavailable
- Generate basic summary from metadata if text quality too poor
- Alert administrators for manual intervention
- Maintain quality metrics for continuous improvement

## Reporting and Monitoring

### Quality Metrics Dashboard
- **Success Rate**: Percentage of bills passing quality checks
- **Common Issues**: Most frequent problems encountered
- **Source Reliability**: Quality scores by data source
- **Processing Time**: Average time for quality validation

### Alert Conditions
- Quality score drops below 60 for multiple consecutive bills
- New error patterns detected in text processing
- Significant increase in manual review queue
- Data source reliability degradation

## Integration Points
- **Bill Text Scraper**: Pre-processing before summarization
- **AI Summarizer**: Quality score influences summarization approach
- **Database**: Store quality scores and issue logs
- **Monitoring**: CloudWatch metrics and alerts

## Success Metrics
- **Quality Improvement**: 25% reduction in AI summary errors
- **Processing Efficiency**: 90% of bills pass automated quality checks
- **User Satisfaction**: Improved summary accuracy ratings
- **Maintenance Reduction**: 50% fewer manual interventions needed