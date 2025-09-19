---
inclusion: fileMatch
fileMatchPattern: '**/bill_*_summarizer.py'
---

# AI Analysis Guidelines for Bill Summarization

## Prompt Engineering Best Practices

### Core Principles
- **Neutrality**: Maintain objective, non-partisan language in all summaries
- **Clarity**: Use plain English accessible to general audiences
- **Accuracy**: Prioritize factual correctness over brevity
- **Completeness**: Cover all major provisions without overwhelming detail

### Structured Output Format
All AI-generated summaries should follow this hierarchy:
1. **Executive Summary** (2-3 sentences)
2. **Key Provisions** (bullet points, max 8)
3. **Financial Impact** (appropriations, authorizations, penalties)
4. **Timeline & Deadlines** (implementation dates, reporting requirements)
5. **Affected Parties** (agencies, individuals, organizations)

### Language Guidelines

#### Preferred Terms
- "Authorizes funding" instead of "appropriates money"
- "Requires agencies to" instead of "mandates that"
- "Establishes penalties" instead of "punishes violations"
- "Modifies existing law" instead of "amends statutes"

#### Avoid These Patterns
- Partisan language ("controversial", "landmark", "historic")
- Speculation about political motivations
- Predictions about passage likelihood
- Emotional or judgmental adjectives

### Technical Specifications

#### Token Management
- **Maximum Input**: 200,000 characters per bill
- **Target Output**: 800-1200 tokens for full summary
- **Section Bullets**: 20-30 tokens each
- **Overview Paragraph**: 100-150 tokens

#### Error Handling
```python
# Graceful degradation for large bills
if len(bill_text) > MAX_TOKENS:
    # Prioritize sections by importance score
    sections = rank_sections_by_importance(bill_text)
    bill_text = truncate_to_top_sections(sections, MAX_TOKENS)
```

#### Quality Validation
- Verify all monetary amounts are properly formatted
- Ensure section references are accurate
- Check that all bullet points are complete sentences
- Validate that overview paragraph summarizes key points

### Domain-Specific Prompts

#### Appropriations Bills
Focus on:
- Funding levels compared to previous years
- New programs or agencies receiving funding
- Restrictions or conditions on spending
- Emergency or supplemental appropriations

#### Authorization Bills
Emphasize:
- New programs or authorities created
- Existing program modifications
- Sunset clauses or reauthorization periods
- Regulatory changes or requirements

#### Tax Legislation
Highlight:
- Tax rate changes and affected income levels
- New credits, deductions, or exemptions
- Business tax provisions
- Implementation timelines and effective dates

### Model-Specific Configurations

#### GPT-4o-mini Settings
```python
{
    "model": "gpt-4o-mini",
    "temperature": 0.0,  # Deterministic output
    "max_tokens": 1200,
    "top_p": 1.0,
    "frequency_penalty": 0.0,
    "presence_penalty": 0.0
}
```

#### Fallback Models
1. **Primary**: GPT-4o-mini (cost-effective, reliable)
2. **Secondary**: GPT-4 (complex bills requiring deeper analysis)
3. **Tertiary**: Claude-3-Haiku (API failures or rate limits)

### Quality Assurance Checklist

#### Pre-Generation
- [ ] Bill text quality score > 75
- [ ] Text length within processing limits
- [ ] All major sections identified
- [ ] Financial information extracted

#### Post-Generation
- [ ] Summary follows structured format
- [ ] All bullet points are factually accurate
- [ ] No partisan language detected
- [ ] Financial figures properly formatted
- [ ] Section references validated

#### User Feedback Integration
- Track user ratings for summary quality
- Identify common complaints or confusion points
- A/B test different prompt variations
- Continuously refine based on user behavior

### Performance Optimization

#### Caching Strategy
- Cache summaries for 30 days after generation
- Invalidate cache when bill text is updated
- Store multiple summary versions (technical vs. plain English)
- Pre-generate summaries for high-priority bills

#### Rate Limiting
- Maximum 100 API calls per hour during peak times
- Queue system for batch processing during off-hours
- Priority system for user-requested vs. automated summaries
- Circuit breaker for API failures

### Monitoring and Alerts

#### Key Metrics
- **Generation Time**: Target <30 seconds per summary
- **Success Rate**: >95% successful generations
- **Quality Score**: Average user rating >4.0/5.0
- **Cost Efficiency**: <$0.50 per summary

#### Alert Conditions
- Generation time exceeds 60 seconds
- Success rate drops below 90%
- User quality ratings drop below 3.5
- Daily API costs exceed budget threshold