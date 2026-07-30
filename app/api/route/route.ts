import { NextResponse } from 'next/server';

// Zone and Gantry configuration table for active ERP gantries in Singapore
interface ZoneConfig {
  zoneId: string;
  gantryIds: number[];
  coord: { lat: number; lng: number };
  headingRange?: { min: number; max: number };
  radiusKm?: number;
  excludeIfHeadingEast?: boolean;
  requiredKeywords?: string[]; // Must match at least one keyword in route summary or instructions
}

const ZONE_CONFIGS: ZoneConfig[] = [
  {
    zoneId: 'CTE_SOUTHBOUND_BRADDELL',
    gantryIds: [31, 33, 34],
    coord: { lat: 1.3410, lng: 103.8558 },
    headingRange: { min: 100, max: 260 }, // Southbound
    radiusKm: 0.35,
    requiredKeywords: ['cte', 'central expw', 'central expressway'],
  },
  {
    zoneId: 'CTE_SLIP_PIE_SERANGOON',
    gantryIds: [68],
    coord: { lat: 1.3350, lng: 103.8572 },
    headingRange: { min: 70, max: 180 }, // Slip road turning SE towards PIE Changi
    radiusKm: 0.25,
    requiredKeywords: ['cte', 'central expw', 'central expressway'],
  },
  {
    zoneId: 'CTE_SOUTHBOUND_AMK',
    gantryIds: [35],
    coord: { lat: 1.3595, lng: 103.8542 },
    headingRange: { min: 100, max: 260 }, // Southbound
    radiusKm: 0.35,
    requiredKeywords: ['cte', 'central expw', 'central expressway'],
  },
  {
    zoneId: 'CTE_NORTHBOUND_PIE_BRADDELL',
    gantryIds: [46, 67],
    coord: { lat: 1.3262, lng: 103.8585 },
    headingRange: { min: 280, max: 80 }, // Northbound
    radiusKm: 0.35,
    requiredKeywords: ['cte', 'central expw', 'central expressway'],
  },
  {
    zoneId: 'CTE_NORTHBOUND_JALAN_BAHAGIA',
    gantryIds: [51],
    coord: { lat: 1.3210, lng: 103.8592 },
    headingRange: { min: 280, max: 80 }, // Northbound
    radiusKm: 0.35,
    requiredKeywords: ['cte', 'central expw', 'central expressway'],
  },
  {
    zoneId: 'AYE_CITYBOUND_SET3',
    gantryIds: [52, 53, 74],
    coord: { lat: 1.3180, lng: 103.7650 },
    headingRange: { min: 30, max: 150 }, // Eastbound
    radiusKm: 0.35,
    requiredKeywords: ['aye', 'ayer rajah'],
  },
  {
    zoneId: 'AYE_TUASBOUND_NORTH_BUONA_VISTA',
    gantryIds: [41],
    coord: { lat: 1.2980, lng: 103.7870 },
    headingRange: { min: 210, max: 330 }, // Westbound
    radiusKm: 0.35,
    requiredKeywords: ['aye', 'ayer rajah'],
  },
  {
    zoneId: 'AYE_JURONG_TOWN_HALL',
    gantryIds: [36],
    coord: { lat: 1.3275, lng: 103.7435 },
    headingRange: { min: 210, max: 330 }, // Westbound
    radiusKm: 0.35,
    requiredKeywords: ['aye', 'ayer rajah'],
  },
  {
    zoneId: 'KPE_SOUTHBOUND_DEFU',
    gantryIds: [50],
    coord: { lat: 1.3530, lng: 103.8965 },
    headingRange: { min: 100, max: 260 }, // Southbound
    radiusKm: 0.35,
    requiredKeywords: ['kpe', 'kallang-paya lebar', 'kallang paya lebar'],
  },
  {
    zoneId: 'MCE_WESTBOUND',
    gantryIds: [90, 91],
    coord: { lat: 1.2705, lng: 103.8470 },
    headingRange: { min: 180, max: 320 }, // Westbound
    radiusKm: 0.25,
    requiredKeywords: ['mce', 'marina coastal'],
  },
  {
    zoneId: 'MCE_EASTBOUND',
    gantryIds: [92, 93],
    coord: { lat: 1.2725, lng: 103.8525 },
    headingRange: { min: 30, max: 150 }, // Eastbound
    radiusKm: 0.35,
    requiredKeywords: ['mce', 'marina coastal'],
  },
  {
    zoneId: 'PIE_EASTBOUND_KALLANG',
    gantryIds: [32, 45],
    coord: { lat: 1.3220, lng: 103.8640 },
    headingRange: { min: 30, max: 150 }, // Eastbound
    radiusKm: 0.35,
    requiredKeywords: ['pie', 'pan island'],
  },
  {
    zoneId: 'PIE_EASTBOUND_ADAM',
    gantryIds: [37, 38],
    coord: { lat: 1.3320, lng: 103.8290 },
    headingRange: { min: 30, max: 150 }, // Eastbound
    radiusKm: 0.35,
    requiredKeywords: ['pie', 'pan island'],
  },
  {
    zoneId: 'PIE_SLIP_CTE',
    gantryIds: [42],
    coord: { lat: 1.3265, lng: 103.8580 },
    headingRange: { min: 100, max: 260 }, // Southbound onto CTE
    radiusKm: 0.30,
    excludeIfHeadingEast: true,
    requiredKeywords: ['pie', 'pan island', 'cte', 'central expw'],
  },
  {
    zoneId: 'PIE_WESTBOUND_EUNOS',
    gantryIds: [65],
    coord: { lat: 1.3280, lng: 103.8990 },
    headingRange: { min: 210, max: 330 }, // Westbound
    radiusKm: 0.35,
    requiredKeywords: ['pie', 'pan island'],
  },
];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const y = Math.sin(dLng) * Math.cos(lat2 * (Math.PI / 180));
  const x =
    Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
    Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos(dLng);
  let brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}

function isHeadingMatching(heading: number, min: number, max: number): boolean {
  if (min <= max) {
    return heading >= min && heading <= max;
  }
  return heading >= min || heading <= max;
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  if (!encoded) return [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const array: Array<{ lat: number; lng: number }> = [];

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    array.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return array;
}

// Interpolate dense sampling points along polylines so highway speed points don't skip gantry coordinates
function interpolatePolylinePoints(rawPoints: Array<{ lat: number; lng: number }>): Array<{ lat: number; lng: number }> {
  if (rawPoints.length === 0) return [];
  const dense: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < rawPoints.length - 1; i++) {
    const p1 = rawPoints[i];
    const p2 = rawPoints[i + 1];
    dense.push(p1);
    const distKm = haversineKm(p1.lat, p1.lng, p2.lat, p2.lng);
    if (distKm > 0.025) { // 25 meters step
      const steps = Math.ceil(distKm / 0.025);
      for (let s = 1; s < steps; s++) {
        const f = s / steps;
        dense.push({
          lat: p1.lat + (p2.lat - p1.lat) * f,
          lng: p1.lng + (p2.lng - p1.lng) * f,
        });
      }
    }
  }
  dense.push(rawPoints[rawPoints.length - 1]);
  return dense;
}

// Upgraded zone and gantry detection using GPS polyline trajectory & directional bearing
function detectLtaZoneIds(route: any): { zoneIds: string[]; gantryIds: number[] } {
  const zoneSet = new Set<string>();
  const gantrySet = new Set<number>();

  const leg = route.legs?.[0];
  const steps = leg?.steps || [];

  let rawPoints: Array<{ lat: number; lng: number }> = [];

  if (route.overview_polyline?.points) {
    rawPoints = decodePolyline(route.overview_polyline.points);
  }

  if (rawPoints.length < 5 && steps.length > 0) {
    steps.forEach((step: any) => {
      if (step.polyline?.points) {
        rawPoints.push(...decodePolyline(step.polyline.points));
      } else {
        if (step.start_location) rawPoints.push({ lat: step.start_location.lat, lng: step.start_location.lng });
        if (step.end_location) rawPoints.push({ lat: step.end_location.lat, lng: step.end_location.lng });
      }
    });
  }

  if (rawPoints.length === 0) {
    return { zoneIds: [], gantryIds: [] };
  }

  const densePoints = interpolatePolylinePoints(rawPoints);

  const summaryText = (route.summary || '').toLowerCase();
  const stepTexts = steps.map((s: any) => (s.html_instructions || '').toLowerCase()).join(' ');
  const fullRouteText = `${summaryText} ${stepTexts}`;
  const isCteRoute = fullRouteText.includes('central expw') || fullRouteText.includes('cte') || fullRouteText.includes('central expressway');

  ZONE_CONFIGS.forEach((config) => {
    // Corridor Verification: Check if route instructions or summary actually use this road corridor
    if (config.requiredKeywords && config.requiredKeywords.length > 0) {
      const isCorridorPresent = config.requiredKeywords.some((kw) => fullRouteText.includes(kw));
      if (!isCorridorPresent) {
        return; // Skip this gantry zone as vehicle is not driving on this highway/road
      }
    }

    const thresholdKm = config.radiusKm || 0.25;

    for (let i = 0; i < densePoints.length; i++) {
      const pt = densePoints[i];
      const dist = haversineKm(pt.lat, pt.lng, config.coord.lat, config.coord.lng);

      if (dist <= thresholdKm) {
        const prevPt = densePoints[Math.max(0, i - 4)];
        const nextPt = densePoints[Math.min(densePoints.length - 1, i + 4)];
        const heading = calculateBearing(prevPt.lat, prevPt.lng, nextPt.lat, nextPt.lng);

        if (config.excludeIfHeadingEast && isHeadingMatching(heading, 45, 135)) {
          continue;
        }

        if (config.headingRange && !isHeadingMatching(heading, config.headingRange.min, config.headingRange.max)) {
          continue;
        }

        zoneSet.add(config.zoneId);
        config.gantryIds.forEach((id) => gantrySet.add(id));
        break;
      }
    }
  });

  if (isCteRoute) {
    // Check if route travels Southbound through the CTE corridor near Braddell / Toa Payoh (lat 1.33 to 1.36)
    const cteSouthboundPoint = densePoints.find((p) => p.lat >= 1.330 && p.lat <= 1.355 && p.lng >= 1.350 && p.lng <= 1.362);
    if (cteSouthboundPoint && !zoneSet.has('CTE_SOUTHBOUND_BRADDELL')) {
      zoneSet.add('CTE_SOUTHBOUND_BRADDELL');
      [31, 33, 34].forEach((id) => gantrySet.add(id));
    }
  }

  return {
    zoneIds: Array.from(zoneSet),
    gantryIds: Array.from(gantrySet),
  };
}

// Calculates estimated traffic light / intersection encounters
function calculateIntersectionScore(leg: any): number {
  if (!leg?.steps || !Array.isArray(leg.steps)) return 0;

  let score = 0;

  leg.steps.forEach((step: any) => {
    const maneuver = step.maneuver || '';
    const text = (step.html_instructions || '').toLowerCase();

    // 1. Maneuvers that almost always involve a traffic light / intersection
    if (
      maneuver.includes('turn') ||
      maneuver.includes('u-turn') ||
      text.includes('turn left') ||
      text.includes('turn right') ||
      text.includes('u-turn') ||
      text.includes('at the traffic light') ||
      text.includes('junction')
    ) {
      score += 1;
    }
    // 2. Long straight segments on non-expressways often cross signalized junctions
    else if (!maneuver && step.distance?.value > 400 && !text.includes('expressway') && !text.includes('e/way')) {
      score += Math.floor(step.distance.value / 500);
    }
  });

  return Math.max(1, score);
}

function getSignatureWaypoint(route: any) {
  const leg = route.legs?.[0];
  if (!leg || !leg.steps || leg.steps.length === 0) {
    const rawPoints = decodePolyline(route.overview_polyline?.points || '');
    if (rawPoints.length === 0) return [];
    const midPt = rawPoints[Math.floor(rawPoints.length * 0.5)];
    return [{ latitude: midPt.lat, longitude: midPt.lng }];
  }

  const steps = leg.steps;
  const summaryLower = (route.summary || '').toLowerCase();

  // Common Singapore expressway/road keywords
  const roadKeywords = [
    'mce', 'marina coastal',
    'cte', 'central expw', 'central expressway',
    'kpe', 'kallang-paya lebar', 'kallang paya lebar',
    'pie', 'pan island',
    'aye', 'ayer rajah',
    'ecp', 'east coast parkway',
    'sle', 'seletar',
    'tpe', 'tampines',
    'bke', 'bukit timah expw', 'bukit timah expressway',
    'nicoll', 'sheares', 'lornie', 'upper thomson', 'serangoon', 'bendemeer'
  ];

  // Find keywords present in the summary
  const matchedSummaryKeywords = roadKeywords.filter((kw) => summaryLower.includes(kw));

  let candidateStep: any = null;

  // 1. Search for a step matching summary keywords
  if (matchedSummaryKeywords.length > 0) {
    let maxDist = -1;
    for (const step of steps) {
      const stepText = (step.html_instructions || '').replace(/<[^>]*>?/gm, '').toLowerCase();
      if (matchedSummaryKeywords.some((kw) => stepText.includes(kw))) {
        if ((step.distance?.value || 0) > maxDist) {
          maxDist = step.distance?.value || 0;
          candidateStep = step;
        }
      }
    }
  }

  // 2. Fallback: Find the longest step in the route
  if (!candidateStep) {
    let maxDist = -1;
    for (const step of steps) {
      const dist = step.distance?.value || 0;
      if (dist > maxDist) {
        maxDist = dist;
        candidateStep = step;
      }
    }
  }

  // Decode candidate step polyline (use 25% mark along the step to hit the open-air main carriageway entry rather than underground tunnel midpoints or exit ramps)
  if (candidateStep) {
    if (candidateStep.polyline?.points) {
      const stepPoints = decodePolyline(candidateStep.polyline.points);
      if (stepPoints.length > 0) {
        // Pick 25% along the step to pin the main trunk line securely
        const idx = Math.floor(stepPoints.length * 0.25);
        const targetPt = stepPoints[idx] || stepPoints[0];
        return [{ latitude: targetPt.lat, longitude: targetPt.lng }];
      }
    }
    if (candidateStep.start_location) {
      return [{ latitude: candidateStep.start_location.lat, longitude: candidateStep.start_location.lng }];
    }
  }

  // Ultimate fallback to overview polyline (at 30% mark along main route)
  const rawPoints = decodePolyline(route.overview_polyline?.points || '');
  if (rawPoints.length === 0) return [];
  const midPt = rawPoints[Math.floor(rawPoints.length * 0.3)] || rawPoints[0];
  return [{ latitude: midPt.lat, longitude: midPt.lng }];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("📥 Received API Payload:", body);

    const { origin, destination } = body;

    if (!origin || !destination) {
      return NextResponse.json(
        { error: "Missing origin or destination in request body" },
        { status: 400 }
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Maps API Key is missing on the server" },
        { status: 500 }
      );
    }

    // Request directions with alternatives and real traffic timings
    const googleMapsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&alternatives=true&departure_time=now&traffic_model=best_guess&key=${apiKey}`;

    const googleRes = await fetch(googleMapsUrl);
    const googleData = await googleRes.json();

    console.log("🗺️ Google Maps API Response Status:", googleData.status);

    if (googleData.status !== 'OK' || !googleData.routes || googleData.routes.length === 0) {
      console.error("Google Directions Error Details:", googleData.error_message || googleData.status);
      return NextResponse.json(
        {
          error: `Google Maps API returned status: ${googleData.status}`,
          details: googleData.error_message || "No routes found between selected points"
        },
        { status: 400 }
      );
    }

    // Process and format all returned routes
    const formattedRoutes = googleData.routes.map((route: any, index: number) => {
      const leg = route.legs[0];

      // Prefer duration_in_traffic over baseline static duration
      const durationSeconds = leg.duration_in_traffic
        ? leg.duration_in_traffic.value
        : leg.duration.value;

      const durationMin = Math.round(durationSeconds / 60);
      const distanceNum = parseFloat((leg.distance.value / 1000).toFixed(1));
      const distanceKm = distanceNum.toFixed(1);

      // Extract ERP Zone IDs & Gantry IDs matching erp-rates.json
      const { zoneIds, gantryIds } = detectLtaZoneIds(route);

      // Calculate the Intersection / Traffic Light Score
      const intersectionScore = calculateIntersectionScore(leg);

      // ERP Penalty is scaled per dollar ($1.00 ERP = 5.0 PTS penalty, 0.0 PTS if no active toll)
      const erpPenalty = 0.0;

      // Composite Score: 1.0/min + 0.5/light + 0.2/km + ERP penalty ($1 = 5 PTS)
      const compositeScore = Number(
        (
          durationMin * 1.0 +
          intersectionScore * 0.5 +
          distanceNum * 0.2 +
          erpPenalty
        ).toFixed(1)
      );

      // Clean HTML instructions for summary label
      const cleanInstruction = leg.steps[0]?.html_instructions?.replace(/<[^>]*>?/gm, '') || 'Main Road';
      const summaryLabel = route.summary ? `Via ${route.summary}` : `Via ${cleanInstruction}`;

      const uniqueId = `route-${index}-${route.summary ? route.summary.replace(/\s+/g, '-').toLowerCase() : 'opt'}`;

      return {
        id: uniqueId,
        summary: summaryLabel,
        via: route.summary || cleanInstruction,
        durationMin,
        distanceKm,
        zoneIds, // Used by app/page.tsx to match erp-rates.json
        gantryIds,
        intersectionScore,
        erpPenalty,
        compositeScore,
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        overviewPolyline: route.overview_polyline?.points,
        waypoints: getSignatureWaypoint(route),
      };
    });

    // Rank routes by lowest composite score
    const sortedRoutes = [...formattedRoutes].sort((a, b) => a.compositeScore - b.compositeScore);
    const winnerRoute = sortedRoutes[0];

    return NextResponse.json({
      winner: winnerRoute,
      allRoutes: sortedRoutes,
      routes: sortedRoutes
    });

  } catch (err: any) {
    console.error("❌ Route Handler Error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}