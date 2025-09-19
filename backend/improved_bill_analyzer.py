#!/usr/bin/env python3
"""
Improved Bill Analyzer based on ChatGPT's structured approach
Focuses on concrete facts: what it does, who's affected, money, deadlines, etc.
"""

import requests
import re
import json
from typing import Optional, Dict, Any, List
from lxml import etree
import fitz  # PyMuPDF for fast PDF processing
from urllib.parse import urljoin

class ImprovedBillAnalyzer:
    def __init__(self, congress_api_key: str = None, govinfo_api_key: str = None):
        self.congress_api_key = congress_api_key
        self.govinfo_api_key = govinfo_api_key
        self.session = requests.Session()
        
        # Precompiled regex patterns for signal extraction
        self.MONEY_NUM = re.compile(r"\$\s?\d[\d,]*(?:\.\d+)?\s*(?:million|billion)?", re.I)
        self.AUTHZ = re.compile(
            r"authorized to be appropriated[^.]*?(?:\$\s?\d[\d,]*(?:\.\d+)?\s*(?:million|billion)?|for\s+fiscal\s+years?\s+\d{4}(?:-\d{2,4})?)\.",
            re.I)
        self.APPR = re.compile(
            r"\bthere (?:is|are) appropriated\b[^.]*\$\s?\d[\d,]*(?:\.\d+)?\s*(?:million|billion)?[^.]*\.",
            re.I)
        self.REPORTING = re.compile(
            r"\b(shall|must)\s+(submit|transmit|provide)\s+(?:an?\s+)?report\b[^.]{0,160}\b("
            r"to\s+Congress|to\s+the\s+Committees?|to\s+the\s+President|to\s+the\s+Secretary|to\s+the\s+Administrator)"
            r"\b[^.]*\.", re.I)
        self.PENALTY = re.compile(r"(?:civil|criminal)\s+penalt[^.]{0,200}\.|fine(?:d)?\s+not\s+more\s+than\s+\$[\d,]+", re.I)
        self.DEADLINE = re.compile(r"(?:not later than|within)\s+[\d\-]+\s+(?:days|months|years)", re.I)
        
        # Improved ACTOR_DUTY pattern
        self.ACTOR_DUTY = re.compile(
            r'\b('
            r'(?:Secretary|Under Secretary|Assistant Secretary)\s+of\s+[A-Z][A-Za-z&\s]+|'
            r'(?:Department|Office|Bureau|Administration|Commission)\s+of\s+[A-Z][A-Za-z&\s]+|'
            r'(?:Administrator|Commandant|Attorney General|President|Coast Guard)'
            r'(?:\s+of\s+[A-Z][A-Za-z&\s]+)?'
            r')\b[^.]{0,180}?\b(shall|must|is directed to|is authorized to)\b',
            re.I)
        
        self.AMENDATORY = re.compile(
            r"\b(?:Section|Sec\.)\s+[\w\-\.\(\)]+(?:\s+of\s+[\w\s\.\-:,;]+?)?\s+(?:is|are)\s+amended\b", re.I)
        
        # Enhanced deadline pattern with context
        self.DEADLINE_SENT = re.compile(
            r'\b([A-Z][^.]{0,120}?\b(?:shall|must|is required to)\b[^.]{0,200}?\b(?:not later than|within)\s+\d{1,3}\s+(?:days|months|years)[^.]*\.)',
            re.I)
        
        # Fiscal year + money pattern for amendatory text
        self.FY_MONEY = re.compile(r'(FY\s?20\d{2}|fiscal\s+year\s+20\d{2})[^$]{0,80}\$\s?\d[\d,]*(?:\.\d+)?\s*(?:million|billion)?', re.I)
        
        # Action sentence pattern for better "what it does" extraction
        self.ACTION_SENT = re.compile(r'\b(shall|must|is required to|authorizes?|establishes?|prohibits?|implements?|enforces?)\b[^.]{15,180}\.', re.I)
        
        # Topic classification patterns
        self.TOPIC_TERMS = {
            "maritime & safety": r"\b(coast guard|vessel|maritime|port|icebreaker|buoy|pilotage|search and rescue)\b",
            "national security": r"\b(security|defense|homeland|sanctions|terrorism)\b",
            "environment & energy": r"\b(environment|emissions|fuel|energy|ballast water|oil spill|climate)\b",
            "workforce": r"\b(personnel|end strength|training|academy|sexual assault|harassment)\b",
            "health & drugs": r"\b(health|medical|opioid|drug|fentanyl|substance|addiction)\b",
            "trade & commerce": r"\b(trade|commerce|economic|business|industry|import|export)\b"
        }
        self.ACTION = r"\b(shall|must|is required to|prohibit|authorize|establish|implement|enforce)\b"
        
        # Junk sentence patterns
        self.JUNK_STARTS = (
            "this act may be cited as",  # short title boilerplate
            "be it enacted by the senate and house",  # enacting clause
            "table of contents", "this act is as follows",  # ToC
        )
        
        # Agency name aliases for normalization
        self.AGENCY_ALIASES = {
            "Administrator of the National Oceanic": "Administrator of the National Oceanic and Atmospheric Administration",
            "NOAA": "National Oceanic and Atmospheric Administration",
            "DHS": "Department of Homeland Security",
            "DoD": "Department of Defense",
        }

    def preclean(self, text: str) -> str:
        """Clean text before regex processing"""
        # de-hyphenate line wraps: "not more than $35,000" split with hyphen + newline
        text = re.sub(r'(\w)-\n(\w)', r'\1\2', text)
        # remove isolated line numbers (1–3 digits) that sit between words
        text = re.sub(r'(?<=\w)\s+[0-9]{1,3}\s+(?=\w)', ' ', text)
        # collapse whitespace
        text = re.sub(r'\s+', ' ', text)
        return text

    def is_junky_sentence(self, s: str) -> bool:
        """Filter out junk sentences"""
        sl = s.strip().lower()
        if not sl or len(sl) < 8:
            return True
        if any(sl.startswith(p) for p in self.JUNK_STARTS):
            return True
        # trivial section labels like "Sec." alone
        if re.fullmatch(r'(sec\.|section|title)\s*\d+[a-zA-Z\-]*', sl):
            return True
        return False

    def normalize_actor(self, name: str) -> str:
        """Normalize and expand agency names"""
        name = re.sub(r'\s+', ' ', name).strip()
        # expand known partials
        for k, v in self.AGENCY_ALIASES.items():
            if name.lower().startswith(k.lower()):
                return v
        # title-case agencies cleanly, but keep acronyms
        tokens = [t if t.isupper() and len(t) <= 5 else t.title() for t in name.split()]
        return ' '.join(tokens)

    def normalize_entity(self, s: str) -> str:
        """Normalize entity names"""
        s = re.sub(r'\s+', ' ', s).strip()
        # keep acronyms uppercase, otherwise title-case
        return ' '.join([w if (w.isupper() and len(w) <= 5) else w.title() for w in s.split()])

    def annotate(self, bullet: str, sec: Optional[str]) -> str:
        """Add section citation to bullet"""
        return f"{bullet} (Sec. {sec})" if sec else bullet

    def extract_deadlines_with_context(self, text: str) -> List[str]:
        """Extract deadlines with full context"""
        out = []
        for m in self.DEADLINE_SENT.finditer(text):
            s = re.sub(r'\s+', ' ', m.group(1)).strip()
            # keep ≤ 200 chars
            if len(s) > 200:
                s = s[:197] + '…'
            out.append(s)
        return out

    def fallback_money_lines(self, text: str) -> List[str]:
        """Find money in amendatory text"""
        hits = []
        for m in self.FY_MONEY.finditer(text):
            s = re.sub(r'\s+', ' ', m.group(0)).strip()
            if len(s) <= 160:
                hits.append(s)
        return hits

    def fetch_bill_content(self, congress: int, bill_type: str, number: str) -> Optional[Dict[str, Any]]:
        """Fetch bill content using multiple sources in priority order"""
        
        # Try USLM XML from govinfo first (best structured data)
        if self.govinfo_api_key:
            uslm_result = self.fetch_uslm_xml(congress, bill_type, number)
            if uslm_result:
                return uslm_result
        
        # Fallback to Congress.gov HTML
        html_result = self.fetch_congress_html(congress, bill_type, number)
        if html_result:
            return html_result
        
        # Last resort: PDF
        pdf_result = self.fetch_pdf_content(congress, bill_type, number)
        if pdf_result:
            return pdf_result
        
        return None

    def fetch_uslm_xml(self, congress: int, bill_type: str, number: str) -> Optional[Dict[str, Any]]:
        """Fetch structured USLM XML from govinfo.gov"""
        try:
            # Try different versions: ih (introduced), eh (engrossed), enr (enrolled)
            for version in ['eh', 'ih', 'rh', 'rs', 'enr']:
                pkg_id = f"BILLS-{congress}{bill_type.lower()}{number}{version}"
                
                url = f"https://api.govinfo.gov/packages/{pkg_id}/content"
                params = {'format': 'xml', 'api_key': self.govinfo_api_key}
                
                response = requests.get(url, params=params, timeout=30)
                if response.status_code == 200:
                    return self.parse_uslm_xml(response.content, pkg_id)
            
            return None
        except Exception as e:
            print(f"USLM XML fetch failed: {e}")
            return None

    def parse_uslm_xml(self, xml_bytes: bytes, source_id: str) -> Dict[str, Any]:
        """Parse USLM XML into structured sections"""
        try:
            NS = {"u": "http://xml.house.gov/schemas/uslm/1.0"}
            root = etree.fromstring(xml_bytes)
            
            def txt(el):
                return " ".join(" ".join(el.itertext()).split()) if el is not None else None
            
            short_title = root.find(".//u:shortTitle", NS)
            official_title = root.find(".//u:longTitle", NS) or root.find(".//u:officialTitle", NS)
            
            sections = []
            for sec in root.findall(".//u:section", NS):
                num_el = sec.find("./u:num", NS)
                heading_el = sec.find("./u:heading", NS)
                body_el = sec.find("./u:content", NS) or sec
                
                section_text = txt(body_el)
                if section_text and len(section_text) > 100:  # Skip very short sections
                    sections.append({
                        "num": txt(num_el),
                        "heading": txt(heading_el),
                        "text": self.preclean(section_text)
                    })
            
            return {
                "source": "uslm_xml",
                "source_id": source_id,
                "short_title": txt(short_title),
                "official_title": txt(official_title),
                "sections": sections,
                "full_text": " ".join([s["text"] for s in sections])
            }
        except Exception as e:
            print(f"USLM XML parsing failed: {e}")
            return None

    def fetch_congress_html(self, congress: int, bill_type: str, number: str) -> Optional[Dict[str, Any]]:
        """Fetch from Congress.gov HTML text page"""
        try:
            # Map bill types to congress.gov format
            type_map = {
                'hr': 'house-bill', 'hres': 'house-resolution',
                'hjres': 'house-joint-resolution', 'hconres': 'house-concurrent-resolution',
                's': 'senate-bill', 'sres': 'senate-resolution',
                'sjres': 'senate-joint-resolution', 'sconres': 'senate-concurrent-resolution'
            }
            
            formatted_type = type_map.get(bill_type.lower(), bill_type.lower())
            url = f"https://www.congress.gov/bill/{congress}th-congress/{formatted_type}/{number}/text"
            
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Extract text content
            text_content = None
            for selector in ['.bill-text-content', '.generated-html-container', 'pre.bill-text']:
                element = soup.select_one(selector)
                if element:
                    text_content = element.get_text()
                    break
            
            if not text_content:
                return None
            
            # Parse into sections
            sections = self.slice_operative_sections(text_content)
            
            return {
                "source": "congress_html",
                "source_id": url,
                "short_title": None,
                "official_title": self.extract_title_from_text(text_content),
                "sections": sections,
                "full_text": text_content
            }
        except Exception as e:
            print(f"Congress.gov HTML fetch failed: {e}")
            return None

    def fetch_pdf_content(self, congress: int, bill_type: str, number: str) -> Optional[Dict[str, Any]]:
        """Fetch and extract PDF content using PyMuPDF"""
        try:
            # Try to get PDF URL from Congress API
            if self.congress_api_key:
                api_url = f"https://api.congress.gov/v3/bill/{congress}/{bill_type}/{number}/text"
                params = {'api_key': self.congress_api_key, 'format': 'json'}
                
                response = requests.get(api_url, params=params, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    text_versions = data.get('textVersions', [])
                    
                    if text_versions:
                        formats = text_versions[0].get('formats', [])
                        pdf_url = None
                        
                        for format_info in formats:
                            if format_info.get('url', '').endswith('.pdf'):
                                pdf_url = format_info['url']
                                break
                        
                        if pdf_url:
                            return self.extract_pdf_text_fast(pdf_url)
            
            return None
        except Exception as e:
            print(f"PDF fetch failed: {e}")
            return None

    def extract_pdf_text_fast(self, pdf_url: str, max_pages: int = 500) -> Optional[Dict[str, Any]]:
        """Fast PDF text extraction using PyMuPDF"""
        try:
            response = requests.get(pdf_url, timeout=120)
            response.raise_for_status()
            
            doc = fitz.open(stream=response.content, filetype="pdf")
            texts = []
            
            for i, page in enumerate(doc):
                if i >= max_pages:
                    break
                texts.append(page.get_text("text"))
            
            full_text = "\n".join(texts)
            sections = self.slice_operative_sections(full_text)
            
            return {
                "source": "pdf",
                "source_id": pdf_url,
                "short_title": None,
                "official_title": self.extract_title_from_text(full_text),
                "sections": sections,
                "full_text": full_text
            }
        except Exception as e:
            print(f"PDF extraction failed: {e}")
            return None

    def slice_operative_sections(self, full_text: str) -> List[Dict[str, Any]]:
        """Split text into operative sections"""
        OPERATIVE_SPLIT = r'(?=^\s*(?:SEC\.|SECTION|TITLE)\s)'
        parts = re.split(OPERATIVE_SPLIT, full_text, flags=re.I | re.M)
        
        sections = []
        for p in parts:
            p = p.strip()
            if len(p) < 400:  # Skip very short sections
                continue
            
            head = p[:160].lower()
            if "definition" in head:  # Skip definition sections
                continue
            
            # Extract section number and heading
            num_match = re.match(r'^\s*(SEC\.|SECTION)\s+(\d+[A-Z]?)', p, re.I)
            section_num = num_match.group(2) if num_match else None
            
            sections.append({
                "num": section_num,
                "heading": None,  # Could extract heading if needed
                "text": self.preclean(p)
            })
        
        return sections

    def extract_title_from_text(self, text: str) -> Optional[str]:
        """Extract bill title from text"""
        # Look for "AN ACT" or "To" clauses
        to_match = re.search(r'To\s+([^.]+\.)', text, re.IGNORECASE)
        if to_match:
            return f"To {to_match.group(1)}"
        
        act_match = re.search(r'AN ACT\s+([^.]+\.)', text, re.IGNORECASE)
        if act_match:
            return f"An Act {act_match.group(1)}"
        
        return None

    def extract_signals(self, section_text: str) -> Dict[str, Any]:
        """Extract structured signals from section text"""
        # Pre-clean the text
        section_text = self.preclean(section_text)
        
        # Extract money with fallback
        authz = [m.group(0).strip() for m in self.AUTHZ.finditer(section_text)]
        appr = [m.group(0).strip() for m in self.APPR.finditer(section_text)]
        
        if not authz and not appr:
            fb = self.fallback_money_lines(section_text)
            # heuristically treat as authorizations (safer) when amendatory
            authz = fb
        
        # Extract actors with normalization
        actors = sorted(set(self.normalize_actor(m.group(1).strip()) for m in self.ACTOR_DUTY.finditer(section_text)))
        
        return {
            "authorizations": authz,
            "appropriations": appr,
            "reports": [m.group(0).strip() for m in self.REPORTING.finditer(section_text)],
            "penalties": [m.group(0).strip() for m in self.PENALTY.finditer(section_text)],
            "deadlines": self.extract_deadlines_with_context(section_text),
            "actors": actors,
            "topics": self.find_topics(section_text),
            "amendatory": len(self.AMENDATORY.findall(section_text))
        }

    def find_topics(self, section_text: str) -> List[str]:
        """Find relevant topics in section text"""
        hits = []
        for label, pattern in self.TOPIC_TERMS.items():
            if re.search(pattern, section_text, re.I) and re.search(self.ACTION, section_text, re.I):
                hits.append(label)
        return hits

    def build_map_from_signals(self, section: Dict[str, Any], signals: Dict[str, Any]) -> Dict[str, Any]:
        """Build structured map from extracted signals"""
        
        what_it_does = []
        section_num = section.get("num")
        
        # 1) Money-driven bullets (verbatim, but short)
        for a in signals["authorizations"][:2]:
            what_it_does.append(self.annotate(f"Authorizes funding: {a}", section_num))
        for a in signals["appropriations"][:2]:
            what_it_does.append(self.annotate(f"Appropriates funds: {a}", section_num))
        
        # 2) Reporting bullets
        for r in signals["reports"][:2]:
            what_it_does.append(self.annotate(f"Requires report: {r}", section_num))
        
        # 3) Enforcement bullets
        for p in signals["penalties"][:2]:
            what_it_does.append(self.annotate(f"Sets penalties: {p}", section_num))
        
        # 4) Remaining action sentences - filter out junk first
        sentences = [s.strip() for s in re.split(r'[.!?]+', section["text"]) if not self.is_junky_sentence(s)]
        
        # Also try broader patterns for legislative text
        broader_patterns = [
            r'(impose[s]?\s+sanctions?\s+[^.]{20,120})',
            r'(establish[es]?\s+[^.]{20,120})',
            r'(require[s]?\s+[^.]{20,120})',
            r'(prohibit[s]?\s+[^.]{20,120})',
            r'(authorize[s]?\s+[^.]{20,120})',
            r'(direct[s]?\s+[^.]{20,120})',
            r'(amend[s]?\s+[^.]{20,120})',
            r'(shall\s+[^.]{20,120})',
            r'(must\s+[^.]{20,120})'
        ]
        
        # Try ACTION_SENT first
        for sentence in sentences:
            clean_sentence = sentence.replace('\n', ' ')
            for m in self.ACTION_SENT.finditer(clean_sentence):
                s = re.sub(r'\s+', ' ', m.group(0)).strip()
                if not self.is_junky_sentence(s) and 20 <= len(s) <= 180 and s not in what_it_does:
                    what_it_does.append(self.annotate(s, section_num))
        
        # If we still don't have much, try broader patterns
        if len(what_it_does) < 3:
            full_text = section["text"].replace('\n', ' ')
            for pattern in broader_patterns:
                matches = re.finditer(pattern, full_text, re.I)
                for match in matches:
                    action = match.group(1).strip()
                    action = re.sub(r'\s+', ' ', action)
                    if 20 <= len(action) <= 120:
                        # Check for duplicates
                        action_lower = action.lower()
                        if not any(action_lower in existing.lower() for existing in what_it_does):
                            what_it_does.append(self.annotate(action, section_num))
        
        # Compress to ≤ 8 items
        what_it_does = what_it_does[:8]
        
        # Extract who is affected - look for clear subjects with normalization
        who_affected = []
        
        # Look for entities that are subject to requirements
        affected_patterns = [
            r'(Chinese\s+(?:producers?|officials?|entities?|companies?))',
            r'(Coast\s+Guard)',
            r'(Secretary\s+of\s+[A-Z][a-z\s]+)',
            r'(Department\s+of\s+[A-Z][a-z\s]+)',
            r'(federal\s+agencies?)',
            r'(state\s+and\s+local\s+governments?)',
            r'(private\s+(?:entities?|companies?|organizations?))',
            r'(individuals?\s+who\s+[^,]{10,40})',
            r'(persons?\s+who\s+[^,]{10,40})'
        ]
        
        for pattern in affected_patterns:
            matches = re.finditer(pattern, section["text"], re.I)
            for match in matches:
                affected = match.group(1).strip()
                # Check if this entity has requirements/actions associated
                context = section["text"][max(0, match.start()-50):match.end()+50]
                if re.search(r'\b(shall|must|may|required|subject to|responsible for)\b', context, re.I):
                    ent = self.normalize_entity(affected)
                    if ent not in who_affected and len(ent) <= 60:
                        who_affected.append(ent)
        
        return {
            "section": {"num": section.get("num"), "heading": section.get("heading")},
            "what_it_does": what_it_does,
            "who_is_affected": who_affected[:3],  # Limit to 3 per section
            "money": {
                "authorizations": signals["authorizations"],
                "appropriations": signals["appropriations"]
            },
            "deadlines": signals["deadlines"],
            "enforcement": signals["penalties"],
            "reporting": signals["reports"],
            "agencies": signals["actors"],
            "topics": signals["topics"],
            "amendatory": signals["amendatory"],
            "citations": [section.get("num")] if section.get("num") else []
        }

    def reduce_merge(self, per_section_maps: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Merge and deduplicate facts across sections"""
        merged = {
            "what_it_does": [],
            "who_is_affected": [],
            "money": {"authorizations": [], "appropriations": []},
            "deadlines": [],
            "enforcement": [],
            "reporting": [],
            "agencies": [],
            "topics": set(),
            "citations": [],
            "amendments": 0
        }
        
        seen_items = set()
        
        for section_map in per_section_maps:
            # Merge what_it_does with deduplication
            for item in section_map["what_it_does"]:
                normalized = re.sub(r'\s+', ' ', item.lower().strip())
                if normalized not in seen_items and len(item) <= 200:  # Allow longer with citations
                    seen_items.add(normalized)
                    merged["what_it_does"].append(item)
            
            # Merge other fields
            for field in ["who_is_affected", "deadlines", "enforcement", "reporting", "agencies"]:
                for item in section_map.get(field, []):
                    if item and item not in merged[field]:
                        merged[field].append(item)
            
            # Merge money (keep verbatim)
            merged["money"]["authorizations"].extend(section_map["money"]["authorizations"])
            merged["money"]["appropriations"].extend(section_map["money"]["appropriations"])
            
            # Merge topics and citations
            merged["topics"].update(section_map.get("topics", []))
            merged["citations"].extend(section_map.get("citations", []))
            
            # Count amendments
            if section_map.get("citations") and section_map.get("amendatory", 0) > 0:
                merged["amendments"] += section_map.get("amendatory", 0)
        
        # Convert topics back to list and limit items
        merged["topics"] = list(merged["topics"])
        
        # Limit final results
        for key in ["what_it_does", "who_is_affected", "deadlines", "enforcement", "reporting", "agencies"]:
            merged[key] = merged[key][:8]  # Max 8 items per category
        
        return merged

    def render_markdown_summary(self, bill_id: str, titles: Dict[str, str], merged: Dict[str, Any]) -> str:
        """Render final markdown summary"""
        
        def bullets(items, limit=8):
            out = []
            for item in items[:limit]:
                s = re.sub(r'\s+', ' ', str(item)).strip()
                if len(s) > 180:
                    s = s[:177] + "…"
                out.append(f"- {s}")
            return "\n".join(out)
        
        md = []
        title = titles.get("short") or titles.get("official") or bill_id
        md.append(f"**{title} ({bill_id})**\n")
        
        if merged["what_it_does"]:
            md.append("**What the bill does**")
            md.append(bullets(merged["what_it_does"]))
            md.append("")
        
        if merged["who_is_affected"]:
            md.append("**Who is affected**")
            md.append(bullets(merged["who_is_affected"]))
            md.append("")
        
        if merged["money"]["authorizations"] or merged["money"]["appropriations"]:
            md.append("**Money**")
            if merged["money"]["authorizations"]:
                md.append("_Authorizations_")
                md.append(bullets(merged["money"]["authorizations"]))
            if merged["money"]["appropriations"]:
                md.append("_Appropriations_")
                md.append(bullets(merged["money"]["appropriations"]))
            md.append("")
        
        if merged["deadlines"]:
            md.append("**Deadlines & effective dates**")
            md.append(bullets(merged["deadlines"]))
            md.append("")
        
        if merged["enforcement"]:
            md.append("**Enforcement & penalties**")
            md.append(bullets(merged["enforcement"]))
            md.append("")
        
        if merged["reporting"]:
            md.append("**Reporting & oversight**")
            md.append(bullets(merged["reporting"]))
            md.append("")
        
        if merged["agencies"]:
            md.append("**Agencies involved**")
            md.append(bullets(merged["agencies"]))
            md.append("")
        
        if merged["topics"]:
            md.append("**Main topics**")
            md.append(bullets(merged["topics"]))
            md.append("")
        
        if merged.get("amendments", 0) > 0:
            md.append("**Amendments to existing law**")
            md.append(f"- {merged['amendments']} amendatory instructions detected")
            md.append("")
        
        if merged.get("citations"):
            unique_citations = sorted(set(c for c in merged["citations"] if c))
            if unique_citations:
                md.append("**Key sections**")
                md.append(bullets([f"Section {c}" for c in unique_citations], limit=10))
        
        return "\n".join(md)

    def analyze_bill(self, congress: int, bill_type: str, number: str) -> Optional[Dict[str, Any]]:
        """Main analysis function - orchestrates the entire process"""
        
        print(f"Analyzing {bill_type.upper()} {number} from {congress}th Congress...")
        
        # Fetch content
        content = self.fetch_bill_content(congress, bill_type, number)
        if not content:
            return None
        
        print(f"Fetched content from {content['source']}: {len(content['sections'])} sections")
        
        # Extract signals from each section
        per_section_maps = []
        for section in content["sections"]:
            signals = self.extract_signals(section["text"])
            section_map = self.build_map_from_signals(section, signals)
            per_section_maps.append(section_map)
        
        # Merge and reduce
        merged = self.reduce_merge(per_section_maps)
        
        # Render summary
        bill_id = f"{bill_type.upper()} {number}"
        titles = {
            "short": content.get("short_title"),
            "official": content.get("official_title")
        }
        
        summary = self.render_markdown_summary(bill_id, titles, merged)
        
        return {
            "bill_id": bill_id,
            "congress": congress,
            "source": content["source"],
            "summary": summary,
            "structured_data": merged,
            "section_count": len(content["sections"]),
            "word_count": len(content["full_text"].split()) if content.get("full_text") else 0
        }


def test_improved_analyzer():
    """Test the improved analyzer"""
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    congress_api_key = os.getenv("CONGRESS_API_KEY")
    govinfo_api_key = os.getenv("GOVINFO_API_KEY")  # You may need to get this
    
    analyzer = ImprovedBillAnalyzer(congress_api_key, govinfo_api_key)
    
    # Test with HR 747
    result = analyzer.analyze_bill(119, 'hr', '747')
    
    if result:
        print("="*60)
        print("IMPROVED BILL ANALYSIS")
        print("="*60)
        print(result["summary"])
        print("\n" + "="*60)
        print(f"Source: {result['source']}")
        print(f"Sections analyzed: {result['section_count']}")
        print(f"Word count: {result['word_count']:,}")
    else:
        print("Analysis failed")


if __name__ == "__main__":
    test_improved_analyzer()