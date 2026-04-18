// Block model + email-safe HTML renderer for outreach campaigns. Output
// mirrors the Ramadan letter format (table-based, inline styles, Outlook-safe).

export type BlockType =
  | "heading"
  | "paragraph"
  | "image"
  | "metrics"
  | "story"
  | "highlight"
  | "cta"
  | "divider"

export interface BlockBase {
  id: string
  type: BlockType
}

export interface HeadingBlock extends BlockBase {
  type: "heading"
  text: string
}
export interface ParagraphBlock extends BlockBase {
  type: "paragraph"
  text: string
  tone?: "default" | "callout"
}
export interface ImageBlock extends BlockBase {
  type: "image"
  url: string
  alt: string
  caption?: string
  width?: number
}
export interface MetricsBlock extends BlockBase {
  type: "metrics"
  title: string
  items: Array<{ number: string; label: string }>
}
export interface StoryBlock extends BlockBase {
  type: "story"
  quote: string
  attribution: string
}
export interface HighlightBlock extends BlockBase {
  type: "highlight"
  title: string
  items: string[]
}
export interface CtaBlock extends BlockBase {
  type: "cta"
  title: string
  text: string
  buttonText: string
  buttonUrl: string
}
export interface DividerBlock extends BlockBase {
  type: "divider"
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ImageBlock
  | MetricsBlock
  | StoryBlock
  | HighlightBlock
  | CtaBlock
  | DividerBlock

export interface CampaignHeader {
  title: string
  subtitle: string
  greeting: string
}

export interface CampaignFooter {
  signatureName: string
  signatureRole: string
  closingText: string
}

export interface Doc {
  header: CampaignHeader
  blocks: Block[]
  footer: CampaignFooter
}

// ─── defaults ───────────────────────────────────────────────────────────────

export function newId() {
  return Math.random().toString(36).slice(2, 10)
}

export function defaultDoc(): Doc {
  return {
    header: {
      title: "Your Campaign Headline Here",
      subtitle: "A short supporting tagline",
      greeting: "Dear Supporters,",
    },
    blocks: [
      {
        id: newId(),
        type: "paragraph",
        text: "Share a short intro about what this update is about and why donors should read it.",
      },
    ],
    footer: {
      signatureName: "Khurram Ismail",
      signatureRole: "President, NourishED Education Inc.",
      closingText:
        "Thank you for standing with us. Every contribution makes a difference.",
    },
  }
}

export function defaultBlock(type: BlockType): Block {
  const id = newId()
  switch (type) {
    case "heading":
      return { id, type, text: "Section Heading" }
    case "paragraph":
      return {
        id,
        type,
        text: "Write your paragraph here.",
        tone: "default",
      }
    case "image":
      return {
        id,
        type,
        url: "",
        alt: "",
        caption: "",
        width: 450,
      }
    case "metrics":
      return {
        id,
        type,
        title: "Program Impact at a Glance",
        items: [
          { number: "3", label: "Active Programs" },
          { number: "160,448+", label: "Meals Served" },
          { number: "1,000+", label: "Students Supported" },
        ],
      }
    case "story":
      return {
        id,
        type,
        quote: "Share a short story or quote from a beneficiary.",
        attribution: "— Beneficiary",
      }
    case "highlight":
      return {
        id,
        type,
        title: "Key Highlights",
        items: ["First point", "Second point", "Third point"],
      }
    case "cta":
      return {
        id,
        type,
        title: "Support our work",
        text: "A short call to action explaining why someone should click the button.",
        buttonText: "Donate Now",
        buttonUrl: "https://nourishedusa.org/donate",
      }
    case "divider":
      return { id, type }
  }
}

// ─── renderer ───────────────────────────────────────────────────────────────

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderHeading(b: HeadingBlock) {
  return `<tr><td style="padding:8px 48px 4px 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#5F8571;line-height:1.25;padding-bottom:10px;">
${esc(b.text)}
</td></tr>
<tr><td align="center" style="padding-bottom:6px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="48" height="3" bgcolor="#A3C19D" style="line-height:3px;font-size:0;border-radius:2px;">&nbsp;</td>
</tr></table>
</td></tr></table>
</td></tr>`
}

function renderParagraph(b: ParagraphBlock) {
  const text = esc(b.text).replace(/\n\n/g, "</p><p style='margin:0 0 12px 0;'>").replace(/\n/g, "<br>")
  if (b.tone === "callout") {
    return `<tr><td style="padding:6px 48px 16px 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFF8E1" style="border-left:4px solid #D4A574;border-radius:6px;">
<tr><td style="padding:16px 18px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.7;color:#4A3B20;">
<p style="margin:0 0 12px 0;">${text}</p>
</td></tr></table>
</td></tr>`
  }
  return `<tr><td style="padding:4px 48px 14px 48px;font-family:Georgia,'Times New Roman',serif;font-size:15.5px;color:#2E3833;line-height:1.75;">
<p style="margin:0 0 12px 0;">${text}</p>
</td></tr>`
}

function renderImage(b: ImageBlock) {
  if (!b.url) return ""
  const w = b.width || 480
  return `<tr><td style="padding:8px 48px 18px 48px;" align="center">
<img src="${esc(b.url)}" width="${w}" style="display:block;max-width:100%;height:auto;border-radius:8px;border:1px solid #EDEFE7;" alt="${esc(b.alt || "")}">
${
  b.caption
    ? `<div style="font-family:Georgia,'Times New Roman',serif;font-size:12px;color:#7A7A70;margin-top:8px;font-style:italic;">${esc(b.caption)}</div>`
    : ""
}
</td></tr>`
}

function renderMetrics(b: MetricsBlock) {
  const cells = b.items
    .map(
      (it) => `
<td align="center" valign="top" style="padding:6px;width:${Math.floor(100 / b.items.length)}%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border:1px solid #D9E6D4;border-radius:8px;">
<tr><td height="3" bgcolor="#A3C19D" style="line-height:3px;font-size:0;border-top-left-radius:8px;border-top-right-radius:8px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:18px 10px 16px 10px;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:700;color:#5F8571;line-height:1.1;letter-spacing:-0.5px;">${esc(it.number)}</div>
<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6B7770;margin-top:6px;letter-spacing:0.6px;text-transform:uppercase;">${esc(it.label)}</div>
</td></tr></table>
</td>`,
    )
    .join("")
  return `<tr><td style="padding:6px 42px 18px 42px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#F3F8F0 0%,#E8F1E4 100%);border-radius:10px;" bgcolor="#F3F8F0">
<tr><td align="center" style="padding:20px 20px 8px 20px;">
<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7FA088;font-weight:600;">${esc(b.title)}</div>
</td></tr>
<tr><td style="padding:4px 12px 16px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>
</td></tr>
</table>
</td></tr>`
}

function renderStory(b: StoryBlock) {
  return `<tr><td style="padding:12px 48px 16px 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FAFAF5" style="border-left:4px solid #D4A574;border-radius:6px;">
<tr><td style="padding:20px 24px 14px 24px;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:38px;color:#D4A574;line-height:0.6;font-weight:700;">&ldquo;</div>
<div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;font-style:italic;line-height:1.7;color:#3A3A33;margin-top:-4px;">
${esc(b.quote)}
</div>
</td></tr>
<tr><td align="right" style="padding:0 24px 18px 24px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7A7A70;letter-spacing:0.4px;">
${esc(b.attribution)}
</td></tr>
</table>
</td></tr>`
}

function renderHighlight(b: HighlightBlock) {
  const items = b.items
    .map(
      (i) => `
<tr><td style="padding:6px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#2E3833;line-height:1.5;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" width="24" style="padding-top:2px;">
<div style="width:18px;height:18px;border-radius:50%;background:#A3C19D;color:#ffffff;text-align:center;font-size:11px;line-height:18px;font-family:Helvetica,Arial,sans-serif;font-weight:700;">&#10003;</div>
</td>
<td valign="top" style="padding-left:10px;">${esc(i).replace(/\n/g, "<br>")}</td>
</tr></table>
</td></tr>`,
    )
    .join("")
  return `<tr><td style="padding:6px 48px 16px 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3F8F0" style="border:1px solid #D9E6D4;border-radius:8px;">
<tr><td style="padding:16px 20px 6px 20px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#5F8571;font-weight:700;">
${esc(b.title)}
</td></tr>
<tr><td style="padding:4px 20px 16px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>
</td></tr>
</table>
</td></tr>`
}

function renderCta(b: CtaBlock) {
  return `<tr><td style="padding:10px 42px 18px 42px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#D35400 0%,#B8470E 100%);border-radius:12px;" bgcolor="#D35400">
<tr><td align="center" style="padding:30px 30px 28px 30px;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#ffffff;line-height:1.25;margin-bottom:10px;">
${esc(b.title)}
</div>
<div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.65;color:#FFEEDD;margin:0 auto 22px auto;max-width:520px;">
${esc(b.text).replace(/\n/g, "<br>")}
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tr><td align="center" bgcolor="#ffffff" style="border-radius:50px;">
<a href="${esc(b.buttonUrl)}" style="display:inline-block;padding:14px 42px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#B8470E;text-decoration:none;letter-spacing:0.5px;">
${esc(b.buttonText)}
</a>
</td></tr></table>
</td></tr></table>
</td></tr>`
}

function renderDivider() {
  return `<tr><td style="padding:10px 48px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="6" height="6" bgcolor="#A3C19D" style="border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
<td width="10">&nbsp;</td>
<td width="6" height="6" bgcolor="#D9E6D4" style="border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
<td width="10">&nbsp;</td>
<td width="6" height="6" bgcolor="#A3C19D" style="border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
</tr></table>
</td></tr>`
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case "heading":
      return renderHeading(b)
    case "paragraph":
      return renderParagraph(b)
    case "image":
      return renderImage(b)
    case "metrics":
      return renderMetrics(b)
    case "story":
      return renderStory(b)
    case "highlight":
      return renderHighlight(b)
    case "cta":
      return renderCta(b)
    case "divider":
      return renderDivider()
  }
}

// Client-side preflight: walks the blocks and returns block-specific issues
// so the UI can tell the user exactly where to edit instead of just warning
// that "the body contains placeholder text".
export function findDocIssues(doc: Doc): string[] {
  const issues: string[] = []
  const labels: Record<BlockType, string> = {
    heading: "Heading",
    paragraph: "Paragraph",
    image: "Image",
    metrics: "Metrics",
    story: "Story / Quote",
    highlight: "Highlight Box",
    cta: "Call to Action",
    divider: "Divider",
  }
  const placeholderRe = /\b(replace\s+with|replace\s+this|lorem ipsum|todo)\b/i

  const checkText = (text: string, blockType: BlockType, fieldLabel: string) => {
    if (!text) return
    if (placeholderRe.test(text)) {
      issues.push(
        `${labels[blockType]} — ${fieldLabel} still has placeholder text`,
      )
    }
  }

  doc.blocks.forEach((b, idx) => {
    const prefix = `#${idx + 1} ${labels[b.type]}`
    switch (b.type) {
      case "heading":
        checkText(b.text, "heading", "heading")
        break
      case "paragraph":
        checkText(b.text, "paragraph", "text")
        break
      case "image":
        if (!b.url) issues.push(`${prefix} — no image uploaded`)
        break
      case "metrics":
        checkText(b.title, "metrics", "title")
        b.items.forEach((it, i) => {
          if (!it.number.trim()) issues.push(`${prefix} — metric ${i + 1} has no number`)
          checkText(it.label, "metrics", `metric ${i + 1} label`)
        })
        break
      case "story":
        checkText(b.quote, "story", "quote")
        checkText(b.attribution, "story", "attribution")
        break
      case "highlight":
        checkText(b.title, "highlight", "title")
        b.items.forEach((it, i) => checkText(it, "highlight", `bullet ${i + 1}`))
        break
      case "cta":
        checkText(b.title, "cta", "heading")
        checkText(b.text, "cta", "supporting text")
        checkText(b.buttonText, "cta", "button text")
        if (!b.buttonUrl) issues.push(`${prefix} — button URL is empty`)
        break
    }
  })
  return issues
}

export function renderEmailHtml(doc: Doc): string {
  const blocksHtml = doc.blocks.map(renderBlock).join("\n")
  // The backend replaces {{UNSUB_URL}} per recipient at send time. The composer
  // preview keeps the placeholder so the user can see where it lands.
  const unsub = `<a href="{{UNSUB_URL}}" style="color:#F3F8F0;text-decoration:underline;font-size:11px;">Unsubscribe</a> &middot; `
  const titleLines = esc(doc.header.title).replace(/\n/g, "<br>")
  const closingText = esc(doc.footer.closingText).replace(/\n/g, "<br>")
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(doc.header.title)}</title>
<!--[if mso]>
<style type="text/css">table, td, div, p, a { font-family: Georgia, 'Times New Roman', serif !important; }</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#EEF2EC;font-family:Georgia,'Times New Roman',serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;color:#2E3833;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(doc.header.subtitle)} — ${esc(doc.header.greeting)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF2EC;">
<tr><td align="center" style="padding:24px 12px;">

<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background-color:#ffffff;border-collapse:collapse;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.05);">

<!-- Hero: brand strip + logo + title banner -->
<tr><td align="center" bgcolor="#ffffff" style="padding:26px 40px 0 40px;">
<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;color:#7FA088;">
NourishED Education Inc.
</div>
<img src="https://res.cloudinary.com/dodmvyeay/image/upload/v1771964625/Nourished_clear_bg_logo_prl5vi.png" width="110" alt="NourishED" style="display:block;margin:14px auto 4px auto;max-width:100%;height:auto;">
</td></tr>

<tr><td style="padding:16px 40px 0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#A3C19D 0%,#7FA088 100%);border-radius:10px;" bgcolor="#A3C19D">
<tr><td align="center" style="padding:30px 28px 26px 28px;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;line-height:1.2;color:#ffffff;">
${titleLines}
</div>
<div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;font-style:italic;color:#F3F8F0;margin-top:10px;letter-spacing:0.3px;">
${esc(doc.header.subtitle)}
</div>
</td></tr></table>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:26px 48px 4px 48px;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#2E3833;font-weight:600;">
${esc(doc.header.greeting)}
</td></tr>

${blocksHtml}

<!-- Signature -->
<tr><td style="padding:10px 48px 30px 48px;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:15.5px;color:#2E3833;line-height:1.75;">
${closingText}
</div>
<div style="margin-top:22px;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#6B7770;font-style:italic;">Warm regards,</div>
<div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#5F8571;font-weight:700;margin-top:4px;">${esc(doc.footer.signatureName)}</div>
<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7A7A70;margin-top:2px;letter-spacing:0.3px;">${esc(doc.footer.signatureRole)}</div>
</div>
</td></tr>

<!-- Footer -->
<tr><td style="padding:0 0 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#5F8571">
<tr><td align="center" style="padding:28px 40px 10px 40px;">
<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:2.5px;text-transform:uppercase;color:#F3F8F0;font-weight:700;">
NourishED Education Inc.
</div>
<div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#F3F8F0;margin-top:8px;opacity:0.92;">
Registered Nonprofit &middot; info@nourishedusa.org
</div>
</td></tr>
<tr><td align="center" style="padding:6px 40px 16px 40px;">
<a href="https://nourishedusa.org" style="color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:12px;margin:0 8px;border-bottom:1px solid rgba(255,255,255,0.5);padding-bottom:1px;">Website</a>
<a href="https://nourishedusa.org/donate" style="color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:12px;margin:0 8px;border-bottom:1px solid rgba(255,255,255,0.5);padding-bottom:1px;">Donate</a>
<a href="https://nourishedusa.org/contactUs" style="color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:12px;margin:0 8px;border-bottom:1px solid rgba(255,255,255,0.5);padding-bottom:1px;">Contact</a>
</td></tr>
<tr><td align="center" style="padding:10px 40px 22px 40px;border-top:1px solid rgba(255,255,255,0.18);">
<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#F3F8F0;opacity:0.85;margin-top:10px;">
${unsub}&copy; ${new Date().getFullYear()} NourishED Education Inc. All rights reserved.
</div>
</td></tr>
</table>
</td></tr>

</table>

</td></tr></table>
</body>
</html>`
}
