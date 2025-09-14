import requests
from bs4 import BeautifulSoup
import re
import json
from typing import Optional, Dict, Any
import time
import pdfplumber
import io
from urllib.parse import urljoin, urlparse

class BillTextScraper:
    def __init__(self, api_key: str = None):
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
        })
    
    def extract_text_from_pdf(self, pdf_url: str, max_size_mb: int = 50, max_pages: int = 500) -> Optional[str]:
        """Extract text from a PDF URL with size and page limits"""
        try:
            print(f"Extracting text from PDF: {pdf_url}")
            
            # First, check the content length to avoid downloading huge files
            head_response = requests.head(pdf_url, timeout=30)
            if head_response.status_code == 200:
                content_length = head_response.headers.get('content-length')
                if content_length:
                    size_mb = int(content_length) / (1024 * 1024)
                    print(f"PDF size: {size_mb:.1f} MB")
                    if size_mb > max_size_mb:
                        print(f"PDF too large ({size_mb:.1f} MB > {max_size_mb} MB), skipping")
                        return None
            
            # Download with streaming to handle large files better
            response = requests.get(pdf_url, timeout=120, stream=True)
            response.raise_for_status()
            
            # Read content in chunks to manage memory
            pdf_content = b''
            downloaded_size = 0
            max_size_bytes = max_size_mb * 1024 * 1024
            
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    downloaded_size += len(chunk)
                    if downloaded_size > max_size_bytes:
                        print(f"PDF download exceeded size limit ({max_size_mb} MB), stopping")
                        return None
                    pdf_content += chunk
            
            print(f"Downloaded PDF: {len(pdf_content) / (1024*1024):.1f} MB")
            
            # Use pdfplumber to extract text with page limits
            with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
                total_pages = len(pdf.pages)
                print(f"PDF has {total_pages} pages")
                
                if total_pages > max_pages:
                    print(f"PDF has too many pages ({total_pages} > {max_pages}), processing first {max_pages} pages only")
                    pages_to_process = max_pages
                else:
                    pages_to_process = total_pages
                
                text_parts = []
                processed_chars = 0
                max_chars = 500000  # Limit to ~500k characters to prevent memory issues
                
                for i, page in enumerate(pdf.pages[:pages_to_process]):
                    if i % 50 == 0:  # Progress indicator for large PDFs
                        print(f"Processing page {i+1}/{pages_to_process}")
                    
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            # Check if we're approaching character limit
                            if processed_chars + len(page_text) > max_chars:
                                print(f"Reached character limit ({max_chars:,}), stopping at page {i+1}")
                                break
                            
                            text_parts.append(page_text)
                            processed_chars += len(page_text)
                    except Exception as page_error:
                        print(f"Error processing page {i+1}: {page_error}")
                        continue
                
                full_text = '\n'.join(text_parts)
                print(f"Extracted {len(full_text):,} characters from {len(text_parts)} pages")
                return full_text if full_text.strip() else None
                
        except requests.exceptions.Timeout:
            print("PDF download timed out")
            return None
        except requests.exceptions.RequestException as e:
            print(f"PDF download failed: {e}")
            return None
        except Exception as e:
            print(f"PDF extraction failed: {e}")
            return None

    def get_bill_text_from_api(self, congress: int, bill_type: str, bill_number: str) -> Optional[Dict[str, Any]]:
        """Try to get bill text from Congress API first"""
        if not self.api_key:
            return None
            
        try:
            url = f"https://api.congress.gov/v3/bill/{congress}/{bill_type}/{bill_number}/text"
            params = {'api_key': self.api_key, 'format': 'json'}
            
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            text_versions = data.get('textVersions', [])
            
            if text_versions:
                # Get the most recent text version
                latest_version = text_versions[0]
                formats = latest_version.get('formats', [])
                
                # Look for PDF format first (most complete), then HTML
                pdf_url = None
                html_url = None
                
                for format_info in formats:
                    format_url = format_info.get('url', '')
                    if format_url.endswith('.pdf'):
                        pdf_url = format_url
                    elif format_url.endswith('.htm') or format_url.endswith('.html'):
                        html_url = format_url
                
                # Try PDF first
                if pdf_url:
                    pdf_text = self.extract_text_from_pdf(pdf_url)
                    if pdf_text:
                        cleaned_text = self.clean_bill_text(pdf_text)
                        return {
                            'url': pdf_url,
                            'title': latest_version.get('type', ''),
                            'text': cleaned_text,
                            'length': len(cleaned_text),
                            'scraped_at': time.time(),
                            'source': 'api_pdf'
                        }
                
                # Fallback to HTML
                if html_url:
                    text_response = requests.get(html_url, timeout=30)
                    text_response.raise_for_status()
                    
                    # Parse HTML content
                    text_content = text_response.text
                    if text_content.startswith('<html>'):
                        soup = BeautifulSoup(text_content, 'html.parser')
                        # Extract text from pre tags (common for bill text)
                        pre_tag = soup.find('pre')
                        if pre_tag:
                            text_content = pre_tag.get_text()
                        else:
                            text_content = soup.get_text()
                    
                    # Clean the text
                    text_content = self.clean_bill_text(text_content)
                    
                    return {
                        'url': html_url,
                        'title': latest_version.get('type', ''),
                        'text': text_content,
                        'length': len(text_content),
                        'scraped_at': time.time(),
                        'source': 'api_html'
                    }
                    
        except Exception as e:
            print(f"API text fetch failed: {e}")
            return None
        
        return None
    
    def get_bill_text_url(self, congress: int, bill_type: str, bill_number: str) -> str:
        """Generate the congress.gov text URL for a bill"""
        # Convert bill type to congress.gov format
        bill_type_map = {
            'hr': 'house-bill',
            'hres': 'house-resolution', 
            'hjres': 'house-joint-resolution',
            'hconres': 'house-concurrent-resolution',
            's': 'senate-bill',
            'sres': 'senate-resolution',
            'sjres': 'senate-joint-resolution',
            'sconres': 'senate-concurrent-resolution'
        }
        
        formatted_type = bill_type_map.get(bill_type.lower(), bill_type.lower())
        return f"https://www.congress.gov/bill/{congress}th-congress/{formatted_type}/{bill_number}/text"
    
    def get_bill_text(self, congress: int, bill_type: str, bill_number: str) -> Optional[Dict[str, Any]]:
        """Get bill text - try API first, then scraping"""
        # Try API first if available
        if self.api_key:
            print("Trying Congress API for bill text...")
            api_result = self.get_bill_text_from_api(congress, bill_type, bill_number)
            if api_result:
                return api_result
        
        # Fallback to scraping
        print("Falling back to web scraping...")
        return self.scrape_bill_text(congress, bill_type, bill_number)
    
    def scrape_bill_text(self, congress: int, bill_type: str, bill_number: str) -> Optional[Dict[str, Any]]:
        """Scrape bill text from congress.gov"""
        try:
            url = self.get_bill_text_url(congress, bill_type, bill_number)
            print(f"Fetching bill text from: {url}")
            
            # Add delay to be respectful
            time.sleep(1)
            
            response = self.session.get(url, timeout=30)
            
            # Check if we got redirected or blocked
            if response.status_code == 403:
                print("Got 403 Forbidden - trying alternative approach")
                # Try without some headers that might trigger blocking
                simple_headers = {
                    'User-Agent': 'Mozilla/5.0 (compatible; Educational Research Bot)'
                }
                response = requests.get(url, headers=simple_headers, timeout=30)
            
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Find the bill text content
            # Congress.gov uses different selectors for bill text
            text_content = None
            
            # Try multiple selectors that congress.gov uses
            selectors = [
                '.bill-text-content',
                '.generated-html-container', 
                '#billTextContainer',
                '.bill-summary-container',
                'pre.bill-text',
                '.legis-body'
            ]
            
            for selector in selectors:
                element = soup.select_one(selector)
                if element:
                    text_content = element.get_text(strip=True)
                    break
            
            # If no specific container found, try to find the main content
            if not text_content:
                # Look for the main bill text in common patterns
                main_content = soup.find('main') or soup.find('div', class_='main-content')
                if main_content:
                    # Remove navigation, headers, footers
                    for unwanted in main_content.find_all(['nav', 'header', 'footer', 'aside']):
                        unwanted.decompose()
                    text_content = main_content.get_text(strip=True)
            
            if not text_content:
                print("Could not find bill text content")
                return None
            
            # Clean up the text
            text_content = self.clean_bill_text(text_content)
            
            # Extract title if possible
            title = self.extract_bill_title(soup, text_content)
            
            return {
                'url': url,
                'title': title,
                'text': text_content,
                'length': len(text_content),
                'scraped_at': time.time(),
                'source': 'scraping'
            }
            
        except Exception as e:
            print(f"Error scraping bill text: {e}")
            return None
    
    def clean_bill_text(self, text: str) -> str:
        """Clean and normalize bill text"""
        # Remove excessive whitespace but preserve paragraph breaks
        text = re.sub(r'[ \t]+', ' ', text)  # Multiple spaces/tabs to single space
        text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)  # Multiple newlines to double newline
        
        # Remove common congress.gov navigation text
        unwanted_phrases = [
            'Skip to main content',
            'Congress.gov',
            'Library of Congress',
            'Browse by Congress',
            'Advanced Search',
            'About Congress.gov',
            '[Congressional Bills',
            '[From the U.S. Government Publishing Office]',
            '&lt;DOC&gt;',
            '&lt;/DOC&gt;'
        ]
        
        for phrase in unwanted_phrases:
            text = text.replace(phrase, '')
        
        # Remove page numbers and similar artifacts
        text = re.sub(r'Page \d+', '', text)
        text = re.sub(r'\d+th CONGRESS', '', text)
        text = re.sub(r'\d+st CONGRESS', '', text)
        text = re.sub(r'\d+nd CONGRESS', '', text)
        text = re.sub(r'\d+rd CONGRESS', '', text)
        
        # Remove session info
        text = re.sub(r'\d+[a-z]+ Session', '', text, flags=re.IGNORECASE)
        
        # Remove HTML entities
        text = text.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
        
        # Clean up extra whitespace again
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def extract_bill_title(self, soup: BeautifulSoup, text: str) -> Optional[str]:
        """Extract the bill title from the page"""
        # Try to find title in meta tags
        title_meta = soup.find('meta', property='og:title') or soup.find('meta', attrs={'name': 'title'})
        if title_meta:
            return title_meta.get('content', '').strip()
        
        # Try to find title in h1 tags
        h1 = soup.find('h1')
        if h1:
            return h1.get_text(strip=True)
        
        # Try to extract from the beginning of the text
        lines = text.split('\n')[:5]  # First 5 lines
        for line in lines:
            line = line.strip()
            if len(line) > 20 and len(line) < 200:  # Reasonable title length
                return line
        
        return None
    

    
    def extract_sections(self, text: str) -> list:
        """Extract major sections from bill text"""
        sections = []
        
        # Look for section headers
        section_patterns = [
            r'SECTION \d+\.',
            r'SEC\. \d+\.',
            r'\(\w+\)\s+[A-Z][A-Z\s]+\.—',
            r'TITLE [IVX]+',
        ]
        
        for pattern in section_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                start = match.start()
                # Get some context after the section header
                context = text[start:start+200].strip()
                sections.append({
                    'header': match.group(),
                    'position': start,
                    'context': context
                })
        
        return sections[:10]  # Limit to first 10 sections
    
    def extract_key_phrases(self, text: str) -> list:
        """Extract key phrases and topics from bill text"""
        # Comprehensive legislative terms that indicate important content
        important_terms = [
            # Core legislative actions
            'appropriation', 'authorization', 'amendment', 'regulation',
            'funding', 'grant', 'program', 'commission', 'department',
            'establish', 'create', 'modify', 'repeal', 'prohibit',
            'require', 'authorize', 'direct', 'ensure', 'implement',
            
            # Enforcement and compliance
            'sanctions', 'penalties', 'enforcement', 'compliance',
            'violation', 'penalty', 'fine', 'criminal', 'civil',
            
            # Jurisdictional and scope
            'federal', 'state', 'local', 'international', 'foreign',
            'domestic', 'national', 'regional', 'global',
            
            # Policy domains
            'security', 'defense', 'health', 'education', 'environment',
            'energy', 'trade', 'commerce', 'agriculture', 'transportation',
            'technology', 'research', 'development', 'innovation',
            
            # Administrative and procedural
            'report', 'review', 'monitor', 'assess', 'evaluate',
            'oversight', 'accountability', 'transparency', 'disclosure',
            
            # Financial and economic
            'budget', 'expenditure', 'revenue', 'tax', 'fiscal',
            'economic', 'financial', 'investment', 'subsidy',
            
            # Stakeholder categories
            'public', 'private', 'nonprofit', 'government', 'agency',
            'organization', 'entity', 'individual', 'citizen'
        ]
        
        key_phrases = []
        text_lower = text.lower()
        
        for term in important_terms:
            if term in text_lower:
                # Find sentences containing this term
                sentences = re.split(r'[.!?]+', text)
                for sentence in sentences:
                    if term in sentence.lower() and len(sentence.strip()) > 20:
                        key_phrases.append({
                            'term': term,
                            'context': sentence.strip()[:200] + '...' if len(sentence) > 200 else sentence.strip(),
                            'frequency': text_lower.count(term)
                        })
                        break  # Only first occurrence per term
        
        # Sort by frequency to prioritize most mentioned terms
        key_phrases.sort(key=lambda x: x['frequency'], reverse=True)
        
        return key_phrases[:15]  # Increased to 15 key phrases for more comprehensive analysis
    
    def extract_provisions(self, text: str) -> list:
        """Extract specific provisions and mechanisms from the bill"""
        provisions = []
        
        # Look for sanctions provisions
        sanctions_patterns = [
            r'impose[s]?\s+sanctions?\s+[^.]{20,100}',
            r'sanctions?\s+shall\s+be\s+imposed\s+[^.]{20,100}',
            r'subject\s+to\s+sanctions?\s+[^.]{20,100}'
        ]
        
        for pattern in sanctions_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                provisions.append({
                    'type': 'sanctions',
                    'description': match.group().strip()
                })
        
        # Look for reporting requirements
        reporting_patterns = [
            r'shall\s+submit\s+[^.]{20,100}\s+report',
            r'report\s+to\s+Congress\s+[^.]{20,100}',
            r'annual\s+report\s+[^.]{20,100}'
        ]
        
        for pattern in reporting_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                provisions.append({
                    'type': 'reporting',
                    'description': match.group().strip()
                })
        
        # Look for enforcement mechanisms
        enforcement_patterns = [
            r'civil\s+penalty\s+[^.]{10,80}',
            r'criminal\s+penalty\s+[^.]{10,80}',
            r'fine\s+of\s+not\s+more\s+than\s+[^.]{10,80}',
            r'imprisonment\s+[^.]{10,80}'
        ]
        
        for pattern in enforcement_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                provisions.append({
                    'type': 'enforcement',
                    'description': match.group().strip()
                })
        
        return provisions[:6]  # Limit to 6 most important provisions
    
    def extract_financial_info(self, text: str) -> dict:
        """Extract financial information from the bill"""
        financial_info = {
            'appropriations': [],
            'authorizations': [],
            'penalties': []
        }
        
        # Look for appropriations
        appropriation_patterns = [
            r'there\s+are?\s+appropriated\s+[^.]{20,100}',
            r'appropriation\s+of\s+\$[\d,]+(?:\.\d+)?\s*(?:million|billion)?',
            r'\$[\d,]+(?:\.\d+)?\s*(?:million|billion)?\s+[^.]{10,50}\s+appropriated'
        ]
        
        for pattern in appropriation_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                financial_info['appropriations'].append(match.group().strip())
        
        # Look for authorizations
        authorization_patterns = [
            r'authorized\s+to\s+be\s+appropriated\s+[^.]{20,100}',
            r'authorization\s+of\s+\$[\d,]+(?:\.\d+)?\s*(?:million|billion)?'
        ]
        
        for pattern in authorization_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                financial_info['authorizations'].append(match.group().strip())
        
        # Look for penalties and fines
        penalty_patterns = [
            r'fine\s+of\s+not\s+more\s+than\s+\$[\d,]+',
            r'civil\s+penalty\s+[^.]{10,80}\$[\d,]+',
            r'\$[\d,]+(?:\.\d+)?\s*(?:million|billion)?\s+penalty'
        ]
        
        for pattern in penalty_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                financial_info['penalties'].append(match.group().strip())
        
        return financial_info
    
    def extract_definitions(self, text: str) -> list:
        """Extract key definitions from the bill"""
        definitions = []
        
        # Look for definition sections
        definition_patterns = [
            r'the\s+term\s+["\']([^"\'\.]+)["\']\s+means\s+([^.]{20,150})',
            r'["\']([^"\'\.]+)["\']\s+means\s+([^.]{20,150})',
            r'([A-Z][A-Z\s]+)\.?—The\s+term\s+[^.]{20,150}'
        ]
        
        for pattern in definition_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                if len(match.groups()) >= 2:
                    term = match.group(1).strip()
                    definition = match.group(2).strip()
                    definitions.append({
                        'term': term,
                        'definition': definition
                    })
        
        return definitions[:5]  # Limit to 5 most important definitions
    
    def create_comprehensive_summary(self, text: str, sections: list, key_phrases: list, 
                                   provisions: list, financial_info: dict, definitions: list, title: str = None) -> str:
        """Create a comprehensive, detailed summary of the bill in plain language"""
        summary_parts = []
        text_lower = text.lower()
        
        # 1. BILL IDENTIFICATION AND PRIMARY PURPOSE
        bill_match = re.search(r'(H\.?\s*R\.?\s*\d+|S\.?\s*\d+|H\.?\s*RES\.?\s*\d+|S\.?\s*RES\.?\s*\d+)', text, re.IGNORECASE)
        bill_id = bill_match.group(1) if bill_match else None
        
        if bill_id:
            summary_parts.append(f"This bill ({bill_id}) ")
        elif title and title != "Engrossed in House":
            summary_parts.append(f"This bill ({title}) ")
        else:
            summary_parts.append("This bill ")
        
        # Extract the main purpose from "To" clauses
        to_match = re.search(r'To\s+([^.]+\.)', text, re.IGNORECASE)
        if to_match:
            purpose = to_match.group(1).strip()
            purpose = re.sub(r'\s+', ' ', purpose)
            if len(purpose) < 300:
                summary_parts.append(f"wants to {purpose.lower()} ")
        
        # 2. STRUCTURAL ANALYSIS
        if len(sections) > 1:
            summary_parts.append(f"The bill has {len(sections)} main parts. ")
            if len(sections) > 5:
                summary_parts.append("It covers a lot of different areas. ")
            else:
                summary_parts.append("It focuses on specific issues. ")
        
        # 3. KEY PROVISIONS AND MECHANISMS
        if provisions:
            summary_parts.append("\n\nWhat the bill does: ")
            
            sanctions_provisions = [p for p in provisions if p['type'] == 'sanctions']
            reporting_provisions = [p for p in provisions if p['type'] == 'reporting']
            enforcement_provisions = [p for p in provisions if p['type'] == 'enforcement']
            
            if sanctions_provisions:
                if len(sanctions_provisions) == 1:
                    summary_parts.append("It creates sanctions (penalties) for certain actions. ")
                else:
                    summary_parts.append(f"It creates {len(sanctions_provisions)} different types of sanctions (penalties). ")
            
            if reporting_provisions:
                if len(reporting_provisions) == 1:
                    summary_parts.append("It requires someone to write reports to Congress. ")
                else:
                    summary_parts.append(f"It requires {len(reporting_provisions)} different reports to be sent to Congress. ")
            
            if enforcement_provisions:
                if len(enforcement_provisions) == 1:
                    summary_parts.append("It sets up penalties for people who break the rules. ")
                else:
                    summary_parts.append(f"It creates {len(enforcement_provisions)} different penalties for rule-breakers. ")
        
        # 4. FINANCIAL AND BUDGETARY IMPACT
        if any(financial_info.values()):
            summary_parts.append("\n\nMoney matters: ")
            
            if financial_info['appropriations']:
                if len(financial_info['appropriations']) == 1:
                    summary_parts.append("The bill sets aside money for specific programs. ")
                else:
                    summary_parts.append(f"The bill sets aside money for {len(financial_info['appropriations'])} different programs. ")
            
            if financial_info['authorizations']:
                summary_parts.append("It gives permission to spend money on certain things. ")
            
            if financial_info['penalties']:
                if len(financial_info['penalties']) == 1:
                    summary_parts.append("It includes fines for people who don't follow the rules. ")
                else:
                    summary_parts.append(f"It includes {len(financial_info['penalties'])} different types of fines. ")
        
        # 5. REGULATORY AND ADMINISTRATIVE FRAMEWORK
        regulatory_terms = ['regulation', 'department', 'commission', 'agency', 'administration']
        regulatory_mentions = [phrase for phrase in key_phrases if phrase['term'] in regulatory_terms]
        
        if regulatory_mentions:
            summary_parts.append("\n\nGovernment agencies: ")
            if len(regulatory_mentions) == 1:
                summary_parts.append("The bill gives new jobs to a government agency. ")
            else:
                summary_parts.append(f"The bill gives new jobs to {len(regulatory_mentions)} government agencies. ")
        
        # 6. SCOPE AND JURISDICTIONAL ANALYSIS
        jurisdictional_terms = ['federal', 'state', 'local', 'international']
        scope_indicators = []
        
        for term in jurisdictional_terms:
            if term in text_lower:
                count = text_lower.count(term)
                if count > 2:  # Significant mentions
                    scope_indicators.append(f"{term}")
        
        if scope_indicators:
            summary_parts.append(f"\n\nWho's involved: This bill affects ")
            if len(scope_indicators) == 1:
                summary_parts.append(f"{scope_indicators[0]} government. ")
            elif len(scope_indicators) == 2:
                summary_parts.append(f"{scope_indicators[0]} and {scope_indicators[1]} governments. ")
            else:
                summary_parts.append(f"{', '.join(scope_indicators[:-1])}, and {scope_indicators[-1]} governments. ")
        
        # 7. DEFINITIONS AND KEY TERMS
        if definitions:
            summary_parts.append(f"\n\nKey terms: ")
            if len(definitions) == 1:
                summary_parts.append("The bill defines an important term to make sure everyone understands what it means. ")
            else:
                summary_parts.append(f"The bill defines {len(definitions)} important terms to make sure everyone understands what they mean. ")
        
        # 8. IMPLEMENTATION AND COMPLIANCE MECHANISMS
        implementation_terms = ['implement', 'comply', 'enforce', 'monitor', 'review']
        implementation_count = sum(1 for term in implementation_terms if term in text_lower)
        
        if implementation_count > 3:
            summary_parts.append("\n\nHow it works: ")
            summary_parts.append("The bill explains how to put the new rules into action and how to make sure people follow them. ")
        
        # 9. POLICY AREAS AND THEMATIC ANALYSIS
        policy_themes = []
        if 'health' in text_lower or 'medical' in text_lower or 'opioid' in text_lower or 'drug' in text_lower:
            policy_themes.append("health and drugs")
        if 'security' in text_lower or 'defense' in text_lower or 'national' in text_lower:
            policy_themes.append("national security")
        if 'trade' in text_lower or 'economic' in text_lower or 'commerce' in text_lower:
            policy_themes.append("business and trade")
        if 'environment' in text_lower or 'climate' in text_lower or 'energy' in text_lower:
            policy_themes.append("environment and energy")
        if 'education' in text_lower or 'research' in text_lower or 'science' in text_lower:
            policy_themes.append("education and research")
        
        if policy_themes:
            summary_parts.append(f"\n\nMain topics: This bill is mainly about ")
            if len(policy_themes) == 1:
                summary_parts.append(f"{policy_themes[0]}. ")
            elif len(policy_themes) == 2:
                summary_parts.append(f"{policy_themes[0]} and {policy_themes[1]}. ")
            else:
                summary_parts.append(f"{', '.join(policy_themes[:-1])}, and {policy_themes[-1]}. ")
        
        # 10. CHANGES TO EXISTING LAWS
        if 'amend' in text_lower:
            amendment_count = text_lower.count('amend')
            if amendment_count > 10:
                summary_parts.append(f"\n\nChanges to existing laws: This bill changes a lot of existing laws ({amendment_count} changes). ")
                summary_parts.append("It builds on what's already there rather than creating something completely new. ")
            elif amendment_count > 1:
                summary_parts.append(f"\n\nChanges to existing laws: This bill makes {amendment_count} changes to laws that already exist. ")
            else:
                summary_parts.append(f"\n\nChanges to existing laws: This bill makes one change to an existing law. ")
        
        # 11. WHO'S RESPONSIBLE
        entities = []
        if 'congress' in text_lower:
            entities.append("Congress")
        if 'president' in text_lower or 'executive' in text_lower:
            entities.append("the President")
        if 'court' in text_lower or 'judicial' in text_lower:
            entities.append("courts")
        if 'private sector' in text_lower or 'industry' in text_lower:
            entities.append("private companies")
        
        if entities:
            summary_parts.append(f"\n\nWho's in charge: ")
            if len(entities) == 1:
                summary_parts.append(f"{entities[0]} will oversee this. ")
            elif len(entities) == 2:
                summary_parts.append(f"{entities[0]} and {entities[1]} will work together on this. ")
            else:
                summary_parts.append(f"{', '.join(entities[:-1])}, and {entities[-1]} will all be involved. ")
        

        
        return "".join(summary_parts)
    
    def generate_summary(self, bill_text: str, title: str = None, max_text_length: int = 200000) -> Dict[str, Any]:
        """Generate a comprehensive summary from bill text using detailed analysis"""
        
        # Truncate extremely large texts to prevent memory issues
        if len(bill_text) > max_text_length:
            print(f"Bill text too long ({len(bill_text):,} chars), truncating to {max_text_length:,} chars")
            bill_text = bill_text[:max_text_length] + "\n\n[Text truncated due to length...]"
        
        try:
            # Extract key sections with detailed analysis
            print("Extracting sections...")
            sections = self.extract_sections(bill_text)
            
            # Find key phrases and topics
            print("Extracting key phrases...")
            key_phrases = self.extract_key_phrases(bill_text)
            
            # Extract specific provisions and mechanisms
            print("Extracting provisions...")
            provisions = self.extract_provisions(bill_text)
            
            # Analyze funding and financial aspects
            print("Extracting financial info...")
            financial_info = self.extract_financial_info(bill_text)
            
            # Extract definitions and key terms
            print("Extracting definitions...")
            definitions = self.extract_definitions(bill_text)
            
            # Generate comprehensive summary
            print("Creating comprehensive summary...")
            summary = self.create_comprehensive_summary(
                bill_text, sections, key_phrases, provisions, financial_info, definitions, title
            )
            
        except Exception as e:
            print(f"Error during summary generation: {e}")
            # Fallback to basic summary if comprehensive analysis fails
            summary = f"This bill addresses legislative matters. Due to processing constraints, a detailed analysis could not be completed. The bill contains approximately {len(bill_text.split()):,} words."
            sections = []
            key_phrases = []
            provisions = []
            financial_info = {'appropriations': [], 'authorizations': [], 'penalties': []}
            definitions = []
        
        return {
            'summary': summary,
            'key_phrases': key_phrases,
            'sections': sections,
            'provisions': provisions,
            'financial_info': financial_info,
            'definitions': definitions,
            'word_count': len(bill_text.split()),
            'estimated_reading_time': max(1, len(bill_text.split()) // 200)  # ~200 words per minute
        }


def test_scraper():
    """Test the bill text scraper"""
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    api_key = os.getenv("CONGRESS_API_KEY")
    print(f"API Key available: {bool(api_key)}")
    
    scraper = BillTextScraper(api_key)
    
    # Test with the example bill from the user (HR 747 has PDF)
    result = scraper.get_bill_text(119, 'hr', '747')
    
    if result:
        print(f"Successfully scraped bill text:")
        print(f"Title: {result['title']}")
        print(f"Text length: {result['length']} characters")
        print(f"First 200 chars: {result['text'][:200]}...")
        
        # Generate summary
        summary_data = scraper.generate_summary(result['text'], result['title'])
        print(f"\nGenerated summary: {summary_data['summary']}")
        print(f"Key phrases: {[p['term'] for p in summary_data['key_phrases']]}")
    else:
        print("Failed to scrape bill text")


if __name__ == "__main__":
    test_scraper()