import { NextResponse } from 'next/server';

// Zone and Gantry mapping table with rich keyword matching and GPS centroids
const ZONE_KEYWORD_MAP: Array<{
  keywords: string[];
  zoneId: string;
  gantryIds: number[];
  coord?: { lat: number; lng: number };
}> = [
  {
    keywords: ['central expy', 'central expressway', 'cte', 'braddell', 'ang mo kio'],
    zoneId: 'CTE_SOUTHBOUND_BRADDELL',
    gantryIds: [31, 33, 34],
    coord: { lat: 1.3410, lng: 103.8560 },
  },
  {
    keywords: ['central expy', 'central expressway', 'cte', 'moulmein', 'balestier'],
    zoneId: 'CTE_NORTHBOUND_PIE',
    gantryIds: [35],
    coord: { lat: 1.3262, lng: 103.8580 },
  },
  {
    keywords: ['ayer rajah expy', 'ayer rajah expressway', 'ayer rajah', 'aye', 'jurong town hall', 'clementi'],
    zoneId: 'AYE_JURONG_TOWN_HALL',
    gantryIds: [36],
    coord: { lat: 1.3275, lng: 103.7435 },
  },
  {
    keywords: ['kallang-paya lebar expy', 'kallang paya lebar expressway', 'kallang paya lebar', 'kpe', 'defu', 'buangkok'],
    zoneId: 'KPE_SOUTHBOUND_DEFU',
    gantryIds: [71],
    coord: { lat: 1.3530, lng: 103.8965 },
  },
  {
    keywords: ['pan island expy', 'pan island expressway', 'pan island', 'pie', 'bendemeer', 'kallang bahru', 'woodsville'],
    zoneId: 'PIE_EASTBOUND_KALLANG',
    gantryIds: [90, 91],
    coord: { lat: 1.3220, lng: 103.8640 },
  },
  {
    keywords: ['pan island expy', 'pan island expressway', 'pan island', 'pie', 'eunos', 'jalan eunos'],
    zoneId: 'PIE_WESTBOUND_EUNOS',
    gantryIds: [45],
    coord: { lat: 1.3280, lng: 103.8990 },
  },
  {
    keywords: ['bugis', 'marina centre', 'marina center', 'rochor', 'nicoll hwy', 'nicoll highway', 'beach rd', 'middle rd', 'ophir rd', 'temasek', 'raffles blvd', 'suntec', 'victoria st'],
    zoneId: 'BUGIS_MARINA_CENTRE',
    gantryIds: [1, 2, 9, 10, 11, 16, 17, 18, 23],
    coord: { lat: 1.2980, lng: 103.8570 },
  },
  {
    keywords: ['shenton', 'chinatown', 'cantonment', 'keppel', 'maxwell', 'anson rd', 'anson road', 'cross st', 'eu tong sen', 'south bridge', 'cecil st', 'robinson rd', 'marina blvd', 'peck seah'],
    zoneId: 'SHENTON_WAY_CHINATOWN',
    gantryIds: [3, 5, 6, 7, 19, 20, 24, 25, 28, 29, 72],
    coord: { lat: 1.2785, lng: 103.8465 },
  },
  {
    keywords: ['orchard', 'somerset', 'scotts rd', 'scotts road', 'paterson rd', 'grange rd', 'cairnhill'],
    zoneId: 'ORCHARD_CORDON',
    gantryIds: [4, 12, 13, 14, 15, 21, 22, 26, 27],
    coord: { lat: 1.3050, lng: 103.8330 },
  },
  {
    keywords: ['fort canning', 'ymca', 'clemenceau', 'bras basah', 'oxley'],
    zoneId: 'YMCA_FORT_CANNING',
    gantryIds: [47, 49],
    coord: { lat: 1.2975, lng: 103.8450 },
  },
  {
    keywords: ['handy rd', 'handy road'],
    zoneId: 'HANDY_ROAD',
    gantryIds: [48],
    coord: { lat: 1.2995, lng: 103.8475 },
  },
  {
    keywords: ['new bridge', 'south bridge', 'fullerton', 'bayfront', 'collyer quay', 'esplanade'],
    zoneId: 'NEW_BRIDGE_SOUTH_BRIDGE_FULLERTON_BAYFRONT',
    gantryIds: [60, 61, 62, 63, 64, 66, 69],
    coord: { lat: 1.2860, lng: 103.8530 },
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

// Upgraded zone and gantry detection combining keyword matching & GPS proximity
function detectLtaZoneIds(route: any): { zoneIds: string[]; gantryIds: number[] } {
  const zoneSet = new Set<string>();
  const gantrySet = new Set<number>();

  const leg = route.legs?.[0];
  const steps = leg?.steps || [];

  const fullText = (
    (route.summary || '') +
    ' ' +
    steps.map((s: any) => s.html_instructions || '').join(' ')
  ).toLowerCase();

  // 1. Keyword-based matching
  ZONE_KEYWORD_MAP.forEach((mapping) => {
    const isMatch = mapping.keywords.some((keyword) => fullText.includes(keyword));
    if (isMatch) {
      zoneSet.add(mapping.zoneId);
      mapping.gantryIds.forEach((id) => gantrySet.add(id));
    }
  });

  // 2. Coordinate proximity matching (check step start/end locations)
  steps.forEach((step: any) => {
    const stepLocations = [
      step.start_location,
      step.end_location,
    ].filter(Boolean);

    stepLocations.forEach((loc) => {
      const sLat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
      const sLng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;

      if (sLat && sLng) {
        ZONE_KEYWORD_MAP.forEach((mapping) => {
          if (mapping.coord) {
            const dist = haversineKm(sLat, sLng, mapping.coord.lat, mapping.coord.lng);
            // If within 0.8 km of gantry centroid
            if (dist <= 0.8) {
              zoneSet.add(mapping.zoneId);
              mapping.gantryIds.forEach((id) => gantrySet.add(id));
            }
          }
        });
      }
    });
  });

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

      // Apply +15.0 penalty points if the route passes through any detected ERP zone
      const erpPenalty = zoneIds.length > 0 ? 15.0 : 0.0;

      // Composite Score: 1.0/min + 0.5/light + 0.2/km + ERP penalty
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
        waypoints: leg.steps.map((step: any) => ({
          latitude: step.end_location.lat,
          longitude: step.end_location.lng,
        })),
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