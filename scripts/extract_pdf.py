import sys
import os
import logging

logging.getLogger("PyPDF2").setLevel(logging.ERROR)

def extract(pdf_path):
    if not os.path.exists(pdf_path):
        sys.stderr.write(f"File not found: {pdf_path}\n")
        sys.exit(1)

    text = ""
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(pdf_path)
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
    except Exception as e:
        sys.stderr.write(f"PDF extraction error: {e}\n")
        sys.exit(1)

    sys.stdout.write(text.strip())

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python extract_pdf.py <path_to_pdf>\n")
        sys.exit(1)
    extract(sys.argv[1])
