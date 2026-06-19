/* Vizor — PDF generation (dark theme).
   Generates 3 kinds of PDFs in the browser using jsPDF (loaded from CDN):
     - Custom Quote (user's calc selection)
     - Plan Brochure (Starter / Pro / Partner)
     - Pilot Brochure
   All read i18n strings from window.vizorT and pricing from window.VizorPricing.
   The dark palette mirrors the site so the PDF feels like an extension of the brand. */

(function () {

  // ── DARK PALETTE (rgb tuples to avoid hex parsing edge cases in jsPDF) ──
  const PAL = {
    bg:        [10, 10, 10],       // #0a0a0a
    surface:   [22, 22, 26],       // #16161A
    surfaceHi: [28, 28, 32],       // raised surface
    border:    [38, 38, 42],       // ~rgba(255,255,255,0.08) on dark
    text:      [245, 243, 239],    // hueso
    textMuted: [115, 114, 109],    // ~45% white on bg
    textMuted2:[80, 80, 75],       // ~28% white on bg
    orange:    [232, 87, 30],      // #E8571E
    orangeDim: [160, 60, 20]
  };

  // ── A4 PORTRAIT, mm units ──
  const PAGE = { w: 210, h: 297, m: 18 };
  const CW = PAGE.w - PAGE.m * 2;  // content width

  // ── CONTACT (single source of truth) ──
  const CONTACT = {
    email:    'info@vizor-solutions.com',
    whatsapp: '5491160029154',
    waPretty: '+54 9 11 6002 9154',
    website:  'vizor-solutions.com',
    calendly: 'https://calendly.com/vizor-solutions'  // adjust to real link when set up
  };

  // ── LOGO CACHE (load once per session) ──
  let logoData = null;
  function loadLogo() {
    if (logoData) return Promise.resolve(logoData);
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        try { logoData = { url: c.toDataURL('image/png'), w: img.width, h: img.height }; }
        catch (e) { logoData = null; }
        resolve(logoData);
      };
      img.onerror = function () { resolve(null); };
      img.src = 'assets/img/logo.png';
    });
  }

  // ── DRAWING PRIMITIVES ─────────────────────────────────────────────────
  function fill(doc, rgb) { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
  function stroke(doc, rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }
  function color(doc, rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }

  function rect(doc, x, y, w, h, rgb) {
    fill(doc, rgb); doc.rect(x, y, w, h, 'F');
  }

  function line(doc, x1, y1, x2, y2, rgb, weight) {
    stroke(doc, rgb || PAL.border);
    doc.setLineWidth(weight || 0.2);
    doc.line(x1, y1, x2, y2);
  }

  // Text helpers: jsPDF font weights are 'normal' / 'bold'. Letter-spacing via setCharSpace (px-ish in mm).
  function setText(doc, opts) {
    doc.setFont('helvetica', opts.weight || 'normal');
    doc.setFontSize(opts.size || 10);
    color(doc, opts.color || PAL.text);
    doc.setCharSpace(opts.spacing || 0);
  }

  // ── HEADER (orange divider + logo + date strip) ──────────────────────
  function drawHeader(doc, lang, t, opts) {
    const y = PAGE.m;

    // Logo (left)
    if (logoData) {
      const logoH = 8;
      const logoW = (logoData.w / logoData.h) * logoH;
      doc.addImage(logoData.url, 'PNG', PAGE.m, y - 1, logoW, logoH);
    } else {
      setText(doc, { size: 13, weight: 'bold', spacing: 0.4, color: PAL.text });
      doc.text('VIZOR', PAGE.m, y + 4);
    }

    // Date / validity (right)
    setText(doc, { size: 7.5, spacing: 0.15, color: PAL.textMuted });
    const dateStr = opts.dateLabel + (opts.validUntilLabel ? '  ·  ' + opts.validUntilLabel : '');
    doc.text(dateStr, PAGE.w - PAGE.m, y + 4, { align: 'right' });

    // Orange divider
    line(doc, PAGE.m, y + 9, PAGE.w - PAGE.m, y + 9, PAL.orange, 0.8);

    return y + 16;
  }

  // ── TITLE BLOCK ──────────────────────────────────────────────────────
  function drawTitleBlock(doc, y, eyebrow, title, subtitle) {
    setText(doc, { size: 8, spacing: 0.4, color: PAL.orange });
    doc.text(eyebrow, PAGE.m, y);
    y += 6;
    setText(doc, { size: 19, weight: 'bold', spacing: 0.3, color: PAL.text });
    doc.text(title, PAGE.m, y);
    y += 6;
    if (subtitle) {
      setText(doc, { size: 9, color: PAL.textMuted });
      doc.text(subtitle, PAGE.m, y);
      y += 4;
    }
    return y + 4;
  }

  // ── ITEMS TABLE (selection list with orange totals) ──────────────────
  function drawItemsTable(doc, y, rows, totalVZ, totalLabel) {
    rows.forEach(function (r) {
      setText(doc, { size: 10, color: PAL.text });
      doc.text(r.name, PAGE.m, y + 5);
      setText(doc, { size: 10, weight: 'bold', color: PAL.orange });
      doc.text(r.vz + ' VZ', PAGE.w - PAGE.m, y + 5, { align: 'right' });
      line(doc, PAGE.m, y + 8, PAGE.w - PAGE.m, y + 8, PAL.border, 0.15);
      y += 9;
    });
    // Total row
    line(doc, PAGE.m, y + 1, PAGE.w - PAGE.m, y + 1, PAL.orange, 0.7);
    y += 6;
    setText(doc, { size: 8, spacing: 0.3, color: PAL.textMuted });
    doc.text(totalLabel, PAGE.m, y + 5);
    setText(doc, { size: 22, weight: 'bold', color: PAL.orange });
    doc.text(totalVZ + ' VZ', PAGE.w - PAGE.m, y + 7, { align: 'right' });
    return y + 14;
  }

  // ── SUGGESTED PLAN BOX (orange tinted box) ───────────────────────────
  function drawSuggestedPlanBox(doc, y, planName, planVZ, totalVZ, t) {
    const h = 22;
    // box bg (orange tint at ~10%) — simulated by mixing with surface
    rect(doc, PAGE.m, y, CW, h, [30, 18, 12]);
    // box border (orange dim)
    stroke(doc, PAL.orange); doc.setLineWidth(0.2);
    doc.rect(PAGE.m, y, CW, h);

    setText(doc, { size: 7.5, spacing: 0.4, color: PAL.orange });
    doc.text(t.pdf_suggested_plan, PAGE.m + 4, y + 6);

    setText(doc, { size: 14, weight: 'bold', color: PAL.text });
    doc.text(planName + '  ·  ' + planVZ + ' VZ', PAGE.m + 4, y + 12);

    const surplus = planVZ - totalVZ;
    if (surplus > 0) {
      setText(doc, { size: 8, spacing: 0.3, color: PAL.orange });
      doc.text(t.pdf_surplus + ' ' + surplus + ' VZ', PAGE.w - PAGE.m - 4, y + 12, { align: 'right' });
    }

    setText(doc, { size: 8.5, color: PAL.textMuted });
    doc.text(t.pdf_plan_subline, PAGE.m + 4, y + 18);

    return y + h + 8;
  }

  // ── WHY CUSTOM QUOTE BOX (info accent) ───────────────────────────────
  function drawWhyBox(doc, y, t) {
    const padX = 4, padY = 5;
    const text = t.pdf_why_body;
    setText(doc, { size: 9, color: PAL.textMuted });
    const wrapped = doc.splitTextToSize(text, CW - 10);
    const h = padY * 2 + 8 + wrapped.length * 4;

    rect(doc, PAGE.m, y, CW, h, PAL.surface);
    // left accent stripe
    rect(doc, PAGE.m, y, 1, h, PAL.orange);

    setText(doc, { size: 7.5, spacing: 0.3, color: PAL.orange });
    doc.text(t.pdf_why_title, PAGE.m + padX + 1, y + padY + 3);

    setText(doc, { size: 9, color: PAL.textMuted });
    doc.text(wrapped, PAGE.m + padX + 1, y + padY + 9);

    return y + h + 8;
  }

  // ── NEXT STEPS (4-step timeline) ─────────────────────────────────────
  function drawNextSteps(doc, y, steps, t) {
    setText(doc, { size: 7.5, spacing: 0.3, color: PAL.textMuted });
    doc.text(t.pdf_next_steps, PAGE.m, y);
    y += 6;

    const colW = CW / steps.length;
    steps.forEach(function (step, i) {
      const cx = PAGE.m + colW * i + colW / 2;
      const cy = y + 4;
      // Numbered dot
      if (i === 0) {
        fill(doc, PAL.orange);
        doc.circle(cx, cy, 3.2, 'F');
        color(doc, PAL.bg);
      } else {
        fill(doc, [30, 18, 12]);
        doc.circle(cx, cy, 3.2, 'F');
        stroke(doc, PAL.orange); doc.setLineWidth(0.2);
        doc.circle(cx, cy, 3.2);
        color(doc, PAL.orange);
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setCharSpace(0);
      doc.text(String(i + 1), cx, cy + 1.2, { align: 'center' });

      // Step text (centered, 2 lines)
      setText(doc, { size: 8, weight: 'bold', color: PAL.text });
      doc.text(step.title, cx, y + 12, { align: 'center' });
      setText(doc, { size: 7.5, color: PAL.textMuted });
      doc.text(step.body, cx, y + 16, { align: 'center', maxWidth: colW - 4 });
    });
    return y + 24;
  }

  // ── CTA BOX (multichannel) ───────────────────────────────────────────
  // `ctaContent` carries the message that Email/WhatsApp will pre-fill — when
  // the client taps a button inside the PDF, Vizor receives a message containing
  // the exact selection/plan they were looking at. No backend needed.
  function drawCTABox(doc, y, t, ctaContent) {
    const c = ctaContent || {};
    const emailSubject = c.emailSubject || t.pdf_email_subject;
    const emailBody    = c.emailBody    || '';
    const whatsappMsg  = c.whatsappMsg  || t.pdf_whatsapp_msg;

    const h = 38;
    rect(doc, PAGE.m, y, CW, h, PAL.surface);
    stroke(doc, PAL.border); doc.setLineWidth(0.2);
    doc.rect(PAGE.m, y, CW, h);

    setText(doc, { size: 12, weight: 'bold', color: PAL.text });
    doc.text(t.pdf_cta_title, PAGE.m + 5, y + 8);
    setText(doc, { size: 8.5, color: PAL.textMuted });
    doc.text(t.pdf_cta_body, PAGE.m + 5, y + 13);

    // 3 buttons
    const btnY = y + 18;
    const btnH = 14;
    const gap = 3;
    const btnW = (CW - 10 - gap * 2) / 3;

    // Email — filled orange
    const ex = PAGE.m + 5;
    rect(doc, ex, btnY, btnW, btnH, PAL.orange);
    setText(doc, { size: 9, weight: 'bold', color: PAL.bg });
    doc.text(t.pdf_btn_email, ex + btnW / 2, btnY + btnH / 2 + 1.5, { align: 'center' });

    // WhatsApp — outline orange
    const wx = ex + btnW + gap;
    stroke(doc, PAL.orange); doc.setLineWidth(0.3);
    doc.rect(wx, btnY, btnW, btnH);
    setText(doc, { size: 9, weight: 'bold', color: PAL.orange });
    doc.text(t.pdf_btn_whatsapp, wx + btnW / 2, btnY + btnH / 2 + 1.5, { align: 'center' });

    // Schedule — outline orange
    const sx = wx + btnW + gap;
    stroke(doc, PAL.orange); doc.setLineWidth(0.3);
    doc.rect(sx, btnY, btnW, btnH);
    setText(doc, { size: 9, weight: 'bold', color: PAL.orange });
    doc.text(t.pdf_btn_schedule, sx + btnW / 2, btnY + btnH / 2 + 1.5, { align: 'center' });

    const mailto = 'mailto:' + CONTACT.email
      + '?subject=' + encodeURIComponent(emailSubject)
      + (emailBody ? '&body=' + encodeURIComponent(emailBody) : '');

    return {
      nextY: y + h + 8,
      links: [
        { x: ex, y: btnY, w: btnW, h: btnH, url: mailto },
        { x: wx, y: btnY, w: btnW, h: btnH, url: 'https://wa.me/' + CONTACT.whatsapp + '?text=' + encodeURIComponent(whatsappMsg) },
        { x: sx, y: btnY, w: btnW, h: btnH, url: CONTACT.calendly }
      ]
    };
  }

  // ── WHAT'S INCLUDED BOX (plan brochures, simpler than the calc one) ──
  function drawIncludedBox(doc, y, t) {
    const items = t.pdf_included_items;
    const h = 12 + items.length * 6;
    rect(doc, PAGE.m, y, CW, h, PAL.surface);

    setText(doc, { size: 7.5, spacing: 0.3, color: PAL.orange });
    doc.text(t.pdf_included_title, PAGE.m + 4, y + 6);

    setText(doc, { size: 9, color: PAL.text });
    items.forEach(function (item, i) {
      doc.text('—  ' + item, PAGE.m + 4, y + 12 + i * 6);
    });
    return y + h + 8;
  }

  // ── FOOTER ────────────────────────────────────────────────────────────
  function drawFooter(doc, t) {
    const y = PAGE.h - PAGE.m;
    line(doc, PAGE.m, y - 8, PAGE.w - PAGE.m, y - 8, PAL.border, 0.15);
    setText(doc, { size: 7, spacing: 0.1, color: PAL.textMuted });
    doc.text(CONTACT.email + '  ·  ' + CONTACT.website + '  ·  ' + CONTACT.waPretty, PAGE.m, y - 4);
    doc.text(t.pdf_footer_disc, PAGE.m, y);
  }

  // ── DOC INIT (dark background) ───────────────────────────────────────
  function createDoc() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF not loaded');
    }
    const doc = new window.jspdf.jsPDF({ format: 'a4', unit: 'mm' });
    fill(doc, PAL.bg);
    doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
    return doc;
  }

  function todayLabel(lang) {
    const d = new Date();
    const monthsEN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const monthsES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const m = (lang === 'es' ? monthsES : monthsEN)[d.getMonth()];
    return (lang === 'es' ? 'EMITIDO ' : 'PREPARED ') + d.getDate() + ' ' + m + ' ' + d.getFullYear();
  }
  function validUntilLabel(lang, days) {
    const d = new Date(); d.setDate(d.getDate() + (days || 30));
    const monthsEN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const monthsES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const m = (lang === 'es' ? monthsES : monthsEN)[d.getMonth()];
    return (lang === 'es' ? 'VÁLIDO HASTA ' : 'VALID UNTIL ') + d.getDate() + ' ' + m + ' ' + d.getFullYear();
  }

  function registerLinks(doc, links) {
    links.forEach(function (l) { doc.link(l.x, l.y, l.w, l.h, { url: l.url }); });
  }

  // ── CTA CONTENT BUILDERS ─────────────────────────────────────────────
  // The body string is shared by Email and WhatsApp (single newline separator
  // works in both — mailto preserves \n via encodeURIComponent, WhatsApp too).
  function buildQuoteCTAContent(t, items, total, suggestedPlan) {
    const itemLines = items.map(function (it) {
      return it.qty + '× ' + it.name + ' (' + (it.qty * it.vz) + ' VZ)';
    }).join('\n');
    const totalLine = t.pdf_msg_total + ': ' + total + ' VZ';
    const planLine = suggestedPlan
      ? '\n' + t.pdf_msg_suggested_plan + ': ' + suggestedPlan.name + ' (' + suggestedPlan.vz + ' VZ)'
      : '';
    const body = t.pdf_msg_quote_intro + '\n\n' + itemLines + '\n\n' + totalLine + planLine + '\n\n' + t.pdf_msg_quote_outro;
    const subject = t.pdf_msg_quote_subject + ' ' + total + ' VZ' + (suggestedPlan ? ' · ' + suggestedPlan.name : '');
    return { emailSubject: subject, emailBody: body, whatsappMsg: body };
  }

  function buildPlanCTAContent(t, planName) {
    const body = t.pdf_msg_plan_intro + ' ' + planName + '.\n\n' + t.pdf_msg_plan_outro;
    const subject = t.pdf_msg_plan_subject + ' ' + planName;
    return { emailSubject: subject, emailBody: body, whatsappMsg: body };
  }

  function buildPilotCTAContent(t) {
    const body = t.pdf_msg_pilot_intro + '\n\n' + t.pdf_msg_pilot_outro;
    return { emailSubject: t.pdf_msg_pilot_subject, emailBody: body, whatsappMsg: body };
  }

  // ── CUSTOM QUOTE ─────────────────────────────────────────────────────
  async function generateCustomQuote(opts) {
    await loadLogo();
    const t = (window.vizorT && window.vizorT[opts.lang]) || window.vizorT.en;
    const doc = createDoc();

    let y = drawHeader(doc, opts.lang, t, {
      dateLabel: todayLabel(opts.lang),
      validUntilLabel: validUntilLabel(opts.lang, 30)
    });

    y = drawTitleBlock(doc, y,
      t.pdf_quote_eyebrow,
      t.pdf_quote_title,
      opts.items.length + ' ' + (opts.items.length === 1 ? t.pdf_quote_subtitle_one : t.pdf_quote_subtitle_many)
    );

    y = drawItemsTable(doc, y, opts.items.map(function (it) {
      return { name: it.qty + ' × ' + it.name, vz: it.qty * it.vz };
    }), opts.total, t.pdf_total_estimated);

    if (opts.suggestedPlan) {
      y = drawSuggestedPlanBox(doc, y, opts.suggestedPlan.name, opts.suggestedPlan.vz, opts.total, t);
    }

    y = drawWhyBox(doc, y, t);

    y = drawNextSteps(doc, y, t.pdf_steps_quote, t);

    const ctaContent = buildQuoteCTAContent(t, opts.items, opts.total, opts.suggestedPlan);
    const cta = drawCTABox(doc, y, t, ctaContent);
    drawFooter(doc, t);
    registerLinks(doc, cta.links);

    doc.save('vizor-custom-quote-' + Date.now() + '.pdf');
  }

  // ── PLAN BROCHURE (Starter / Pro / Partner) ──────────────────────────
  async function generatePlanBrochure(opts) {
    await loadLogo();
    const t = (window.vizorT && window.vizorT[opts.lang]) || window.vizorT.en;
    const P = window.VizorPricing;
    if (!P) throw new Error('VizorPricing not loaded');

    const plan = P.getPlan(opts.planId);
    if (!plan) throw new Error('Plan not found: ' + opts.planId);

    const planNames = { starter: 'Starter', pro: 'Pro', partner: 'Partner' };
    const planName = planNames[opts.planId] || opts.planId;

    // Build example rows from plan.ejemplo[]
    const exampleRows = (plan.ejemplo || []).map(function (line) {
      const ent = P.getEntregable(line.entregable_id);
      const dn = t.deliverable_names[line.entregable_id];
      const name = line.cantidad === 1 ? (dn.singular) : (dn.plural);
      return { name: line.cantidad + ' × ' + name, vz: line.cantidad * (ent ? ent.vz : 0) };
    });

    const totalExample = exampleRows.reduce(function (s, r) { return s + r.vz; }, 0);

    const doc = createDoc();

    let y = drawHeader(doc, opts.lang, t, {
      dateLabel: todayLabel(opts.lang),
      validUntilLabel: null
    });

    y = drawTitleBlock(doc, y,
      t.pdf_plan_eyebrow,
      planName.toUpperCase() + '  ·  ' + plan.vz + ' VZ',
      t['p' + (opts.planId === 'starter' ? '1' : opts.planId === 'pro' ? '2' : '3') + '_desc']
    );

    // Validity strip
    setText(doc, { size: 8, spacing: 0.3, color: PAL.textMuted });
    const validityText = t.validity_prefix + ' ' + (plan.validez_dias >= 30 && plan.validez_dias % 30 === 0
      ? (plan.validez_dias / 30) + ' ' + t.validity_unit_months
      : plan.validez_dias + ' ' + t.validity_unit_days);
    doc.text(validityText, PAGE.m, y);
    y += 8;

    // Usage example
    setText(doc, { size: 7.5, spacing: 0.3, color: PAL.orange });
    doc.text(t.pdf_usage_example, PAGE.m, y);
    y += 5;

    y = drawItemsTable(doc, y, exampleRows, totalExample, t.pdf_example_total);

    y = drawIncludedBox(doc, y, t);

    y = drawWhyBox(doc, y, t);

    const cta = drawCTABox(doc, y, t, buildPlanCTAContent(t, planName));
    drawFooter(doc, t);
    registerLinks(doc, cta.links);

    doc.save('vizor-plan-' + opts.planId + '-' + Date.now() + '.pdf');
  }

  // ── VZ PILOT BROCHURE ────────────────────────────────────────────────
  async function generatePilotBrochure(opts) {
    await loadLogo();
    const t = (window.vizorT && window.vizorT[opts.lang]) || window.vizorT.en;
    const doc = createDoc();

    let y = drawHeader(doc, opts.lang, t, {
      dateLabel: todayLabel(opts.lang),
      validUntilLabel: validUntilLabel(opts.lang, 30)
    });

    y = drawTitleBlock(doc, y,
      t.pilot_label.toUpperCase(),
      t.pdf_pilot_title,
      t.pilot_desc
    );

    // USD investment box
    const boxH = 22;
    rect(doc, PAGE.m, y, CW, boxH, [30, 18, 12]);
    stroke(doc, PAL.orange); doc.setLineWidth(0.2);
    doc.rect(PAGE.m, y, CW, boxH);

    setText(doc, { size: 7.5, spacing: 0.4, color: PAL.orange });
    doc.text(t.pilot_inv_label.toUpperCase(), PAGE.m + 4, y + 6);
    setText(doc, { size: 22, weight: 'bold', color: PAL.text });
    doc.text('USD 150', PAGE.m + 4, y + 14);
    setText(doc, { size: 8, color: PAL.textMuted });
    doc.text(t.pilot_disc, PAGE.m + 4, y + 19);
    y += boxH + 8;

    // What's included
    const pilotIncluded = [t.pi1, t.pi2, t.pi3, t.pi4];
    const incH = 12 + pilotIncluded.length * 6;
    rect(doc, PAGE.m, y, CW, incH, PAL.surface);
    setText(doc, { size: 7.5, spacing: 0.3, color: PAL.orange });
    doc.text(t.pdf_included_title, PAGE.m + 4, y + 6);
    setText(doc, { size: 9, color: PAL.text });
    pilotIncluded.forEach(function (item, i) {
      doc.text('—  ' + item, PAGE.m + 4, y + 12 + i * 6);
    });
    y += incH + 8;

    // How it works (5 mini-steps stacked)
    setText(doc, { size: 7.5, spacing: 0.3, color: PAL.orange });
    doc.text(t.pilot_how.toUpperCase(), PAGE.m, y);
    y += 6;

    const pilotSteps = [
      { t: t.ps1t, d: t.ps1d },
      { t: t.ps2t, d: t.ps2d },
      { t: t.ps3t, d: t.ps3d },
      { t: t.ps4t, d: t.ps4d },
      { t: t.ps5t, d: t.ps5d }
    ];
    pilotSteps.forEach(function (step, i) {
      setText(doc, { size: 8, spacing: 0.2, color: PAL.orange });
      doc.text(String(i + 1).padStart(2, '0'), PAGE.m, y + 4);
      setText(doc, { size: 9.5, weight: 'bold', color: PAL.text });
      doc.text(step.t, PAGE.m + 10, y + 4);
      setText(doc, { size: 8.5, color: PAL.textMuted });
      doc.text(step.d, PAGE.m + 10, y + 8, { maxWidth: CW - 12 });
      y += 11;
    });
    y += 4;

    const cta = drawCTABox(doc, y, t, buildPilotCTAContent(t));
    drawFooter(doc, t);
    registerLinks(doc, cta.links);

    doc.save('vizor-pilot-' + Date.now() + '.pdf');
  }

  // ── EXPOSE API ───────────────────────────────────────────────────────
  window.VizorPDF = {
    generateCustomQuote: generateCustomQuote,
    generatePlanBrochure: generatePlanBrochure,
    generatePilotBrochure: generatePilotBrochure,
    preloadLogo: loadLogo
  };

  // Preload logo as soon as the module runs — first click feels instant.
  loadLogo();
})();
