"""
Generate a styled PDF whitepaper from the markdown source.
Run with the verdex-pdf-env virtual environment Python.
"""
from fpdf import FPDF
import re


def clean_text(text):
    # Remove markdown bold/italic markers for PDF plain text
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'\*(.*?)\*', r'\1', text)
    # Normalize unicode to ASCII for core font compatibility
    text = text.replace('\u2014', '--')   # em dash
    text = text.replace('\u2013', '-')    # en dash
    text = text.replace('\u2018', "'")   # left single quote
    text = text.replace('\u2019', "'")   # right single quote
    text = text.replace('\u201c', '"')   # left double quote
    text = text.replace('\u201d', '"')   # right double quote
    text = text.replace('\u2026', '...') # ellipsis
    text = text.replace('\u00d7', 'x')   # multiplication sign
    # Core PDF fonts only support Latin-1. Remove any remaining non-Latin
    # glyphs (for example Mermaid emojis) rather than failing generation.
    return text.encode('latin-1', 'ignore').decode('latin-1').strip()


class WhitepaperPDF(FPDF):
    def header(self):
        self.set_font('Helvetica', 'B', 10)
        self.set_text_color(34, 197, 94)
        self.cell(0, 10, 'Verdex Whitepaper v1.1', align='L')
        self.set_text_color(100, 100, 100)
        self.cell(0, 10, 'verdexswap.site', align='R')
        self.ln(12)
        self.set_draw_color(34, 197, 94)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f'Page {self.page_no()}', align='C')

    def chapter_title(self, title, level=1):
        self.set_font('Helvetica', 'B', 22 if level == 1 else 16 if level == 2 else 13)
        color = (34, 197, 94) if level >= 2 else (0, 0, 0)
        self.set_text_color(*color)
        self.ln(8 if level == 1 else 6)
        self.multi_cell(0, 10, clean_text(title))
        self.ln(2)
        if level == 1:
            self.set_draw_color(34, 197, 94)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(4)

    def body_text(self, text):
        self.set_font('Helvetica', '', 11)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6.5, clean_text(text))
        self.ln(3)

    def bullet_list(self, items):
        self.set_font('Helvetica', '', 11)
        self.set_text_color(40, 40, 40)
        for item in items:
            start_x = self.get_x()
            self.cell(10)
            self.cell(4, 6.5, chr(149), align='C')
            self.multi_cell(176, 6.5, clean_text(item))
            self.set_x(start_x)
        self.ln(2)

    def numbered_list(self, items):
        self.set_font('Helvetica', '', 11)
        self.set_text_color(40, 40, 40)
        for i, item in enumerate(items, 1):
            start_x = self.get_x()
            self.cell(10)
            self.cell(8, 6.5, f'{i}.', align='L')
            self.multi_cell(172, 6.5, clean_text(item))
            self.set_x(start_x)
        self.ln(2)

    def render_table(self, headers, rows):
        self.ln(2)
        if len(headers) == 3:
            col_widths = (25, 115, 40)
        elif len(headers) == 4:
            col_widths = (35, 45, 55, 45)
        else:
            col_widths = tuple([180 / len(headers)] * len(headers))

        self.set_font('Helvetica', size=10)
        with self.table(col_widths=col_widths, text_align="LEFT") as table:
            # Header Row
            header_row = table.row()
            for header in headers:
                header_row.cell(clean_text(header))
            # Data Rows
            for row in rows:
                data_row = table.row()
                for cell in row:
                    data_row.cell(clean_text(cell))
        self.ln(4)

    def highlight_box(self, text):
        self.set_fill_color(235, 250, 238)
        self.set_draw_color(34, 197, 94)
        self.set_font('Helvetica', '', 11)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6.5, clean_text(text), border=1, fill=True)
        self.ln(4)


def parse_markdown(md_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = f.read().splitlines()

    elements = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # Skip dividers
        if stripped == '---':
            i += 1
            continue

        # Main title
        if stripped.startswith('# ') and not stripped.startswith('## '):
            elements.append(('h1', stripped[2:]))
            i += 1
            continue

        # Subtitle / meta line
        if stripped.startswith('## ') and not stripped.startswith('### '):
            elements.append(('h2', stripped[3:]))
            i += 1
            continue

        # H3
        if stripped.startswith('### '):
            elements.append(('h3', stripped[4:]))
            i += 1
            continue

        # H4
        if stripped.startswith('#### '):
            elements.append(('h4', stripped[5:]))
            i += 1
            continue

        # Table
        if '|' in stripped and i + 1 < len(lines) and '|' in lines[i + 1] and '---' in lines[i + 1]:
            headers = [c.strip() for c in stripped.split('|') if c.strip()]
            i += 2
            rows = []
            while i < len(lines) and '|' in lines[i]:
                row = [c.strip() for c in lines[i].split('|') if c.strip()]
                if row:
                    rows.append(row)
                i += 1
            elements.append(('table', (headers, rows)))
            continue

        # Code block
        if stripped.startswith('```'):
            i += 1
            code_lines = []
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code_lines.append(lines[i])
                i += 1
            i += 1
            elements.append(('code', '\n'.join(code_lines)))
            continue

        # Bullet list
        if stripped.startswith('- ') or stripped.startswith('* '):
            items = []
            while i < len(lines) and (lines[i].strip().startswith('- ') or lines[i].strip().startswith('* ')):
                items.append(lines[i].strip()[2:])
                i += 1
            elements.append(('bullets', items))
            continue

        # Numbered list
        match = re.match(r'^(\d+)\.\s+', stripped)
        if match:
            items = []
            while i < len(lines):
                m = re.match(r'^(\d+)\.\s+', lines[i].strip())
                if m:
                    items.append(lines[i].strip()[len(m.group(0)):])
                    i += 1
                else:
                    break
            elements.append(('numbered', items))
            continue

        # Blockquote / highlight
        if stripped.startswith('>'):
            elements.append(('highlight', stripped[1:].strip()))
            i += 1
            continue

        # Regular paragraph
        elements.append(('p', stripped))
        i += 1

    return elements


def main():
    pdf = WhitepaperPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Cover title
    pdf.set_font('Helvetica', 'B', 32)
    pdf.set_text_color(34, 197, 94)
    pdf.ln(40)
    pdf.cell(0, 20, 'Verdex', align='C')
    pdf.ln(16)
    pdf.set_font('Helvetica', 'B', 22)
    pdf.set_text_color(40, 40, 40)
    pdf.cell(0, 14, 'Whitepaper', align='C')
    pdf.ln(20)
    pdf.set_font('Helvetica', '', 12)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 10, 'Version 1.1 | July 2026 | Pre-launch technical update', align='C')
    pdf.ln(10)
    pdf.cell(0, 10, 'Swap Smart. Grow Green.', align='C')

    pdf.add_page()

    elements = parse_markdown('verdex-whitepaper.md')

    for el_type, content in elements:
        if el_type == 'h1':
            pdf.chapter_title(content, level=1)
        elif el_type == 'h2':
            pdf.chapter_title(content, level=2)
        elif el_type == 'h3':
            pdf.chapter_title(content, level=3)
        elif el_type == 'h4':
            pdf.chapter_title(content, level=4)
        elif el_type == 'p':
            pdf.body_text(content)
        elif el_type == 'bullets':
            pdf.bullet_list(content)
        elif el_type == 'numbered':
            pdf.numbered_list(content)
        elif el_type == 'table':
            headers, rows = content
            pdf.render_table(headers, rows)
        elif el_type == 'code':
            pdf.set_font('Courier', '', 11)
            pdf.set_fill_color(240, 240, 240)
            pdf.multi_cell(0, 7, clean_text(content), border=1, fill=True)
            pdf.ln(4)
        elif el_type == 'highlight':
            pdf.highlight_box(content)

    output_path = r'C:\Users\kidst\Videos\verdex-website\assets\verdex-whitepaper.pdf'
    pdf.output(output_path)
    print(f'PDF generated: {output_path}')


if __name__ == '__main__':
    main()
