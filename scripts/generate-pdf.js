const { jsPDF } = require('jspdf');
const fs = require('fs');
const path = require('path');

function generateDocumentationPDF() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  let y = margin;

  // Colors
  const primaryColor = [2, 132, 199];   // #0284c7 (Sky Blue)
  const secondaryColor = [15, 23, 42]; // #0f172a (Dark Slate)
  const accentColor = [129, 140, 248];  // #818cf8 (Indigo)
  const darkText = [30, 41, 59];       // #1e293b
  const mutedText = [100, 116, 139];   // #64748b

  function checkPageBreak(neededHeight) {
    if (y + neededHeight > pageHeight - margin - 12) {
      addFooter();
      doc.addPage();
      y = margin + 10;
      addHeader();
    }
  }

  function addHeader() {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...mutedText);
    doc.text('NEHvigation - System Architecture & Technical Documentation', margin, 12);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, 14, pageWidth - margin, 14);
  }

  function addFooter() {
    const pageNum = doc.internal.getNumberOfPages();
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...mutedText);
    doc.text('Confidential & Proprietary - Prepared for Shaunneh', margin, pageHeight - 9);
    doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
  }

  // Cover / Header Banner
  doc.setFillColor(...secondaryColor);
  doc.roundedRect(margin, y, contentWidth, 38, 4, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('NEHvigation', margin + 10, y + 15);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(56, 189, 248); // Light Sky Blue
  doc.text('Singapore ERP & Toll Route Optimizer - Technical Overview', margin + 10, y + 23);

  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text('Comprehensive System Architecture, Tech Stack, & Algorithmic Logic Documentation', margin + 10, y + 31);

  y += 46;

  // Function to draw Section Header with smart page break prevention
  function drawSectionHeader(title, minNextSpace = 30) {
    if (y + 15 + minNextSpace > pageHeight - margin - 12) {
      addFooter();
      doc.addPage();
      y = margin + 10;
      addHeader();
    }

    doc.setFillColor(...primaryColor);
    doc.rect(margin, y, 3, 10, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...secondaryColor);
    doc.text(title, margin + 7, y + 7.5);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 12, pageWidth - margin, y + 12);

    y += 17;
  }

  function drawParagraph(text) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...darkText);
    const lines = doc.splitTextToSize(text, contentWidth);
    checkPageBreak(lines.length * 4.5);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 3;
  }

  function drawBullet(title, desc) {
    const indent = 6;
    const availWidth = contentWidth - indent;
    const titleText = `${title}: `;

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    const titleWidth = doc.getTextWidth(titleText);

    doc.setFont('helvetica', 'normal');

    let usesNewLineForDesc = false;
    let line1 = '';
    let restWords = [];

    const minDescWidthOnLine1 = 35; // minimum mm required on line 1 for description text
    const line1Available = availWidth - titleWidth;

    if (line1Available >= minDescWidthOnLine1) {
      const words = desc.split(' ');
      for (let i = 0; i < words.length; i++) {
        const test = line1 ? line1 + ' ' + words[i] : words[i];
        if (doc.getTextWidth(test) <= line1Available) {
          line1 = test;
        } else {
          restWords = words.slice(i);
          break;
        }
      }
    } else {
      usesNewLineForDesc = true;
      restWords = desc.split(' ');
    }

    let restLines = [];
    if (restWords.length > 0) {
      restLines = doc.splitTextToSize(restWords.join(' '), availWidth);
    }

    const totalLines = (usesNewLineForDesc ? 1 : 1) + restLines.length;
    const neededHeight = totalLines * 4.8 + 3;

    checkPageBreak(neededHeight);

    // Draw bullet dot (crisp blue vector circle instead of ASCII bullet character)
    doc.setFillColor(...primaryColor);
    doc.circle(margin + 2, y - 1.1, 0.8, 'F');

    // Draw Title
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...secondaryColor);
    doc.text(titleText, margin + indent, y);

    // Draw Desc
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkText);

    if (!usesNewLineForDesc) {
      doc.text(line1, margin + indent + titleWidth, y);
      if (restLines.length > 0) {
        y += 4.8;
        doc.text(restLines, margin + indent, y);
        y += (restLines.length - 1) * 4.8 + 4;
      } else {
        y += 5.5;
      }
    } else {
      y += 4.8;
      doc.text(restLines, margin + indent, y);
      y += (restLines.length - 1) * 4.8 + 4;
    }
  }

  // SECTION 1: Problem Statement
  drawSectionHeader('1. Executive Summary & Problem Statement', 30);
  drawParagraph(
    'Driving in Singapore involves navigating a dense network of Electronic Road Pricing (ERP) gantries across expressways (CTE, PIE, AYE, KPE, MCE, ECP) and arterial roads (Central Business District, Orchard, Bugis). Toll rates fluctuate dynamically based on time-of-day, vehicle classification, and traffic congestion schedules.'
  );
  drawParagraph(
    'Conventional navigation software (e.g., standard Google Maps or Waze) evaluates routes primarily based on travel time or distance. They frequently fail to address the total cost of ownership per trip, often routing drivers through high-fee ERP gantries to save 1-2 minutes, or taking indirect detours that consume significantly more fuel than the toll avoided.'
  );
  drawParagraph(
    'NEHvigation solves this by providing a unified Singapore Toll & Energy Optimizer. It evaluates live and scheduled LTA ERP gantry rates, calculates vehicle-specific fuel/EV consumption with urban traffic idling adjustments, calculates total monetary cost per route option, and automatically identifies the most cost-effective path.'
  );

  // SECTION 2: Key Features
  drawSectionHeader('2. Key Functional Capabilities', 40);
  drawBullet('Real-Time LTA ERP Gantry Matching', 'Leverages spatial buffer queries (~80m radius) via Turf.js to identify every ERP gantry crossed along alternative route options.');
  drawBullet('Dynamic Time-Window Schedules', 'Supports Live SG Time, Morning Peak (08:30), Evening Peak (18:30), or Custom departure times/days to predict toll fees accurately.');
  drawBullet('Vehicle & Fuel Efficiency Engine', 'Features presets for vehicles (e.g., Skoda Yeti 10.4 km/L, Hyundai Ioniq 5 EV 17.5 kWh/100km, Goods Vehicles, Taxis, Motorcycles) plus custom rate inputs.');
  drawBullet('Traffic Score & Speed Multiplier Engine', 'Evaluates real-time average speed (km/h) to categorize traffic conditions into 5 distinct speed tiers, applying dynamic fuel consumption multipliers (up to +35% for heavy crawling congestion).');
  drawBullet('Intersection & Traffic Light Penalty', 'Tracks traffic light density along route segments, adding stop-start idling overhead (~20ml fuel or 0.005 kWh EV penalty per traffic light).');
  drawBullet('Composite Route Recommendation', 'Computes a multi-variable composite score weighing travel duration, distance, ERP tolls ($1.00 = 5 pts), fuel cost, and traffic light delays to auto-select the "Best Value Route".');
  drawBullet('Seamless Google Maps Handoff', 'Deep-links optimized routes with precise numerical lat/lng waypoints directly into native mobile Google Maps without URL parsing errors.');

  // SECTION 3: Tech Stack
  drawSectionHeader('3. Technical Stack & Dependencies', 50);
  
  // Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...secondaryColor);
  doc.text('Layer / Component', margin + 4, y + 5);
  doc.text('Technology / Library', margin + 55, y + 5);
  doc.text('Purpose & Implementation', margin + 115, y + 5);

  y += 7;

  const stackRows = [
    ['Framework', 'Next.js 16 (App Router)', 'Full-stack React 19 app with API routes & SSR'],
    ['Language', 'TypeScript 5', 'End-to-end type safety & structured models'],
    ['Styling', 'Tailwind CSS v4', 'Dark-theme responsive design for OLED & mobile'],
    ['Authentication', 'NextAuth.js v5 + Google OAuth', 'Secure whitelisted email access control'],
    ['Maps & Geocoding', '@react-google-maps/api', 'Google Places Autocomplete & Directions API'],
    ['Geospatial Engine', '@turf/turf & @mapbox/polyline', 'Polyline decoding & spatial gantry buffering'],
    ['PDF Generator', 'jsPDF', 'Dynamic architecture & reporting document compilation']
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  stackRows.forEach(([layer, tech, purpose], idx) => {
    checkPageBreak(8);
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 6.5, 'F');
    }
    doc.setTextColor(...darkText);
    doc.text(layer, margin + 4, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.text(tech, margin + 55, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.text(purpose, margin + 115, y + 4.5);
    y += 6.5;
  });

  y += 6;

  // SECTION 4: System Architecture & Logics Considered
  drawSectionHeader('4. Core Architectural Logics & Algorithms', 40);

  drawBullet(
    'A. Spatial Buffer Gantry Detection Algorithm',
    'When candidate routes are received from Google Directions API, polylines are decoded into coordinate arrays. Turf.js constructs spatial line-buffers (~80m). Gantry coordinates are checked against these buffers to determine exact gantry hits per route.'
  );

  drawBullet(
    'B. LTA Rate Schedule Matrix',
    'ERP toll rates are retrieved based on gantry IDs, vehicle type, day of week, and time window. The engine automatically checks if the departure falls into active operating windows (e.g. 07:00-09:30 CTE inbound) or off-peak zero-rate periods.'
  );

  drawBullet(
    'C. Traffic Score & Speed Factor Logic',
    'Derives average speed (km/h) = Distance / Duration. Categorizes traffic into 5 speed tiers: <20 km/h (Heavy Congestion, 1.35x fuel multiplier), 20-35 km/h (Slow Traffic, 1.20x), 35-50 km/h (Moderate, 1.10x), 50-80 km/h (Optimal Cruising, 1.00x), and >80 km/h (Expressway Drag, 1.05x).'
  );

  drawBullet(
    'D. Fuel, Energy & Intersection Cost Logic',
    'Calculates distance-based fuel/EV usage using: Energy = (Distance / Efficiency) x SpeedFactor + TrafficLightStopPenalty (~20ml fuel / 0.005 kWh per intersection). Total Cost = ERP Toll ($) + [Energy Consumed x Fuel Price ($/L or $/kWh)].'
  );

  drawBullet(
    'E. Composite Route Optimization Score',
    'Computes a weighted scoring penalty: CompositeScore = (DurationMin x 1.0) + (TrafficLightScore x 0.5) + (DistanceKm x 0.1) + (ERPTollFee x 5.0) + (FuelLiters x 10.0). The route with the lowest composite score is highlighted as the winner.'
  );

  drawBullet(
    'F. Mobile GPS & Deep-Linking Optimization',
    'Geolocation utilizes a 2-phase fallback mechanism (3.5s high-accuracy fix fallback to network cell-triangulation) for fast response times. Google Maps URLs utilize strict numeric coordinates (lat,lng) to prevent mobile app string-parsing errors.'
  );

  drawBullet(
    'G. Whitelist Authorization Security',
    'NextAuth middleware verifies user credentials against an authorized whitelist. Unapproved users are redirected to a branded access restriction view ("Access Denied! Reach out to Shaunneh").'
  );

  // Add final footer on last page
  addFooter();
  addHeader();

  // Save to public folder
  const outputDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'NEHvigation_Documentation.pdf');
  const pdfBuffer = doc.output('arraybuffer');
  fs.writeFileSync(outputPath, Buffer.from(pdfBuffer));

  console.log(`PDF successfully generated at: ${outputPath}`);
}

generateDocumentationPDF();
