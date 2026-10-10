#!/usr/bin/env python3
"""Generates tests/fixtures/long-manual-extract.pdf, a small multi-page PDF used by the
PDF ingestion test. It has a running header, page-number footers and numbered headings,
like the long manuals the app must index. Requires: pip install reportlab.

    python3 tests/fixtures/make_long_manual_pdf.py
"""

from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

OUT = Path(__file__).with_name("long-manual-extract.pdf")

SECTIONS = [
    ("4.1 Motor does not start", [
        "Check the supply voltage at the panel input. Expected 400 V between phases.",
        "If one phase is missing, inform the electrical supervisor and do not restart the pump.",
    ]),
    ("4.2 Low discharge pressure", [
        "Confirm the suction strainer is clean and below the minimum water level.",
        "Prime the pump by opening the vent until water flows steadily, then close the vent.",
        "Look for air leaks on the suction pipe. Bubbles in the sight glass indicate air entry.",
    ]),
    ("4.3 Bearing noise", [
        "Listen at each bearing housing. A grinding sound means the bearing needs grease or replacement.",
        "Check shaft alignment at the coupling with a dial gauge against the maintenance sheet limit.",
    ]),
    ("4.4 Seal leakage", [
        "A slow drip of a few drops per minute is normal for gland packing.",
        "A steady leak from the mechanical seal face requires replacement of the seal kit. Do not over-tighten.",
    ]),
]


def build():
    styles = getSampleStyleSheet()

    def header_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.drawString(60, A4[1] - 40, "MP-200 Pump Station Service Manual - Extract")
        canvas.drawRightString(A4[0] - 60, 30, f"Page {doc.page}")
        canvas.restoreState()

    story = [
        Paragraph("MP-200 Pump Station Troubleshooting Extract", styles["Title"]),
        Paragraph(
            "This extract is for indexing tests. Procedures are invented for demonstration only.",
            styles["BodyText"],
        ),
        PageBreak(),
    ]
    for heading, paragraphs in SECTIONS:
        story.append(Paragraph(heading, styles["Heading2"]))
        for text in paragraphs:
            story.append(Paragraph(text, styles["BodyText"]))
            story.append(Spacer(1, 10))
        story.append(PageBreak())

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, title="MP-200 extract", author="fixture")
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    build()
