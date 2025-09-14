#!/usr/bin/env python3
"""
Plain-English Bill Summarizer (not diff/change-only)
- Reuses ImprovedBillAnalyzer to fetch/section the bill
- Ranks sections by importance (money, deadlines, penalties, agencies)
- LLM step 1: per-section micro-bullets ("Sec. X: ...")
- LLM step 2: whole-bill TL;DR (6 bullets + 1 short paragraph)
- Outputs: out/bill_summary.md
"""

import os, re, json
from typing import List, Dict, Any, Optional, Tuple

# your existing analyzer file/class
from improved_bill_analyzer import ImprovedBillAnalyzer

# OpenAI client
from openai import OpenAI

# ---------------- Helpers ----------------
def norm(s: str) -> str:
    if not s: return ""
    s = s.replace("\u00AD", "")
    s = re.sub(r"(\w)-\s*\n(\w)", r"\1\2", s)
    return re.sub(r"\s+", " ", s).strip()

def score_section(analyzer: ImprovedBillAnalyzer, section: Dict[str, Any]) -> int:
    """Heuristic importance score from analyzer's regex signals."""
    sig = analyzer.extract_signals(section["text"])
    score = 0
    score += 3 * (len(sig["authorizations"]) + len(sig["appropriations"]))
    score += 2 * (len(sig["deadlines"]) + len(sig["penalties"]))
    score += 1 * (len(sig["reports"]) + len(sig["actors"]) + len(sig["topics"]))
    score += min(len(section["text"]) // 800, 2)  # small bump for length (cap)
    return score

# ---------------- LLM wrappers ----------------
class LLM:
    def __init__(self, model: str = "gpt-4o-mini", temperature: float = 0.0):
        if not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError("Set OPENAI_API_KEY")
        self.client = OpenAI()
        self.model = model
        self.temperature = temperature
    
    def json(self, prompt: str, max_tokens: int = 800) -> Dict[str, Any]:
        r = self.client.chat.completions.create(
            model=self.model,
            temperature=self.temperature,
            response_format={"type":"json_object"},
            messages=[
                {"role":"system","content":"Return ONLY valid JSON. No prose."},
                {"role":"user","content":prompt},
            ],
            max_tokens=max_tokens,
        )
        return json.loads(r.choices[0].message.content)
    
    def text(self, prompt: str, max_tokens: int = 600) -> str:
        r = self.client.chat.completions.create(
            model=self.model,
            temperature=self.temperature,
            messages=[
                {"role":"system","content":"Write concise, neutral, well-structured English."},
                {"role":"user","content":prompt},
            ],
            max_tokens=max_tokens,
        )
        return r.choices[0].message.content.strip()

# ---------------- Summarizer ----------------
class BillPlainSummarizer(ImprovedBillAnalyzer):
    """
    Produces a readable summary of the bill (overview + bullets),
    not a diff/change-only digest.
    """
    def __init__(self, congress_api_key: str=None, govinfo_api_key: str=None, llm_model: str="gpt-4o-mini"):
        super().__init__(congress_api_key, govinfo_api_key)
        self.llm = LLM(model=llm_model, temperature=0.0)
    
    # 1) Micro-summarize one section -> a single, crisp bullet
    def summarize_section_bullet(self, section: Dict[str,Any]) -> str:
        secno = section.get("num")
        txt = norm(section["text"])[:1800]  # small budget per call
        prompt = f"""
You are summarizing ONE section of a U.S. bill. Write ONE bullet (max 28 words) that states:
- the main action/requirement,
- the primary actor(s),
- the target/beneficiary or subject,
- any dollar amounts or deadlines.

Use neutral language, no speculation. Start with "Sec. {secno}:" if a section number is provided.

SECTION TEXT:
{txt}

Return ONLY JSON: {{"bullet": "Sec. {secno}: ..."}}
""".strip()
        try:
            obj = self.llm.json(prompt, max_tokens=200)
            bullet = obj.get("bullet") or ""
        except Exception:
            bullet = ""
        bullet = norm(bullet)
        if secno and not bullet.lower().startswith("sec."):
            bullet = f"Sec. {secno}: {bullet}"
        return bullet[:220]
    
    # 2) Whole-bill TL;DR from selected bullets
    def synthesize_overview(self, title: str, bullets: List[str]) -> str:
        bullets_text = "\n".join(f"- {b}" for b in bullets[:60])
        prompt = f"""
You are a legislative analyst. Create a plain-English summary of the bill below.

Input:
- Bill title: {title}
- Selected section bullets (representative, possibly incomplete):
{bullets_text}

Write:
1) A **6-bullet TL;DR** (each ≤ 20 words; factual; no repetition; group related ideas).
2) One short paragraph (≤ 130 words) explaining overall purpose, major programs or rules, who's affected, and notable funding/deadlines.

Output format (markdown):
**TL;DR**
- ...
- ...

**Overview**
<paragraph>
""".strip()
        return self.llm.text(prompt, max_tokens=450)
    
    # 3) Orchestrate: pick top sections, summarize, then synthesize
    def summarize_bill(self, congress: int, bill_type: str, number: str,
                       max_sections: int = 40) -> Dict[str,Any]:
        content = self.fetch_bill_content(congress, bill_type, number)
        if not content:
            return {"error":"fetch_failed"}
        
        title = content.get("short_title") or content.get("official_title") or f"{bill_type.upper()} {number}"
        sections = content["sections"]
        
        scored: List[Tuple[int,Dict[str,Any]]] = []
        for sec in sections:
            try:
                scored.append((score_section(self, sec), sec))
            except Exception:
                continue
        
        scored.sort(key=lambda x: x[0], reverse=True)
        chosen = [s for _, s in scored[:max_sections]]
        
        bullets: List[str] = []
        for sec in chosen:
            b = self.summarize_section_bullet(sec)
            if b and b not in bullets:
                bullets.append(b)
        
        if not bullets:
            bullets = [f"Sec. {s.get('num')}: {norm(s['text'])[:160]}…" for s in chosen[:10]]
        
        overview_md = self.synthesize_overview(title, bullets)
        
        appendix = "\n".join(f"- {b}" for b in bullets[:30])
        doc = [
            f"**{title}**\n",
            overview_md.strip(),
            "\n**Key sections (selected)**",
            appendix if appendix.strip() else "- (none)"
        ]
        return {
            "title": title,
            "source": content["source"],
            "summary_markdown": "\n".join(doc),
            "selected_bullets": bullets,
            "sections_considered": len(chosen),
            "total_sections": len(sections),
            "words": len((content.get('full_text') or '').split())
        }

# ---------------- CLI ----------------
if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    
    CONGRESS_API_KEY = os.getenv("CONGRESS_API_KEY")  # optional
    GOVINFO_API_KEY  = os.getenv("GOVINFO_API_KEY")   # optional
    
    CONGRESS = int(os.getenv("BILL_CONGRESS", "119"))
    BILL_TYPE = os.getenv("BILL_TYPE", "hr")
    NUMBER = os.getenv("BILL_NUMBER", "4275")
    
    outdir = "out"; os.makedirs(outdir, exist_ok=True)
    
    summarizer = BillPlainSummarizer(CONGRESS_API_KEY, GOVINFO_API_KEY, llm_model="gpt-4o-mini")
    result = summarizer.summarize_bill(CONGRESS, BILL_TYPE, NUMBER, max_sections=40)
    
    if "error" in result:
        print("Fetch failed.")
    else:
        with open(os.path.join(outdir, "bill_summary.md"), "w", encoding="utf-8") as f:
            f.write(result["summary_markdown"])
        with open(os.path.join(outdir, "bill_summary_sections.json"), "w", encoding="utf-8") as f:
            json.dump({
                "selected_bullets": result["selected_bullets"],
                "sections_considered": result["sections_considered"],
                "total_sections": result["total_sections"],
                "words": result["words"]
            }, f, indent=2, ensure_ascii=False)
        print("Wrote out/bill_summary.md and out/bill_summary_sections.json")