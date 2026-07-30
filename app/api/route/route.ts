import { NextResponse } from 'next/server';

// Zone and Gantry configuration table for active ERP gantries in Singapore
interface ZoneConfig {
  zoneId: string;
  gantryIds: number[];
  coord: { lat: number; lng: number };
  headingRange?: { min: number; max: number };
}

const ZONE_CONFIGS: ZoneConfig[] = [
  {
    zoneId: 'CTE_SOUTHBOUND_BRADDELL',
    gantryIds: [31, 33, 34],
    coord: { lat: 1.3410, lng: 103.8560 },
    headingRange: { min: 135, max: 225 }, // Southbound
  },
  {
    zoneId: 'CTE_SLIP_PIE_SERANGOON',
    gantryIds: [68],
    coord: { lat: 1.3350, lng: 103.8570 },
    headingRange: { min: 80, max: 160 }, // Slip road turning SE towards PIE Changi
  },
  {
    zoneId: 'CTE_SOUTHBOUND_AMK',
    gantryIds: [35],
    coord: { lat: 1.3600, lng: 103.8540 },
    headingRange: { min: 135, max: 225 }, // Southbound
  },
  {
    zoneId: 'CTE_NORTHBOUND_PIE_BRADDELL',
    gantryIds: [46, 67],
    coord: { lat: 1.3262, lng: 103.8580 },
    headingRange: { min: 315, max: 45 }, // Northbound
  },
  {
    zoneId: 'CTE_NORTHBOUND_JALAN_BAHAGIA',
    gantryIds: [51],
    coord: { lat: 1.3210, lng: 103.8590 },
    headingRange: { min: 315, max: 45 }, // Northbound
  },
  {
    zoneId: 'AYE_CITYBOUND_SET3',
    gantryIds: [52, 53, 74],
    coord: { lat: 1.3180, lng: 103.7650 },
    headingRange: { min: 45, max: 135 }, // Eastbound
  },
  {
    zoneId: 'AYE_TUASBOUND_NORTH_BUONA_VISTA',
    gantryIds: [41],
    coord: { lat: 1.2980, lng: 103.7870 },
    headingRange: { min: 225, max: 315 }, // Westbound
  },
  {
    zoneId: 'AYE_JURONG_TOWN_HALL',
    gantryIds: [36],
    coord: { lat: 1.3275, lng: 103.7435 },
    headingRange: { min: 225, max: 315 }, // Westbound
  },
  {
    zoneId: 'KPE_SOUTHBOUND_DEFU',
    gantryIds: [50],
    coord: { lat: 1.3530, lng: 103.8965 },
    headingRange: { min: 135, max: 225 }, // Southbound
  },
  {
    zoneId: 'MCE_WESTBOUND',
    gantryIds: [90, 91],
    coord: { lat: 1.2720, lng: 103.8510 },
    headingRange: { min: 210, max: 310 }, // Westbound
  },
  {
    zoneId: 'MCE_EASTBOUND',
    gantryIds: [92, 93],
    coord: { lat: 1.2740, lng: 103.8540 },
    headingRange: { min: 30, max: 130 }, // Eastbound
  },
  {
    zoneId: 'PIE_EASTBOUND_KALLANG',
    gantryIds: [32, 45],
    coord: { lat: 1.3220, lng: 103.8640 },
    headingRange: { min: 45, max: 135 }, // Eastbound
  },
  {
    zoneId: 'PIE_EASTBOUND_ADAM',
    gantryIds: [37, 38],
    coord: { lat: 1.3320, lng: 103.8290 },
    headingRange: { min: 45, max: 135 }, // Eastbound
  },
  {
    zoneId: 'PIE_SLIP_CTE',
    gantryIds: [42],
    coord: { lat: 1.3280, lng: 103.8560 },
    headingRange: { min: 135, max: 225 }, // Southbound onto CTE
  },
  {
    zoneId: 'PIE_WESTBOUND_EUNOS',
    gantryIds: [65],
    coord: { lat: 1.3280, lng: 103.8990 },
    headingRange: { min: 225, max: 315 }, // Westbound
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

// Upgraded zone and gantry detection using GPS polyline trajectory & directional bearing
function detectLtaZoneIds(route: any): { zoneIds: string[]; gantryIds: number[] } {
  const zoneSet = new Set<string>();
  const gantrySet = new Set<number>();

  const leg = route.legs?.[0];
  const steps = leg?.steps || [];

  let points: Array<{ lat: number; lng: number }> = [];

  if (route.overview_polyline?.points) {
    points = decodePolyline(route.overview_polyline.points);
  }

  if (points.length < 5 && steps.length > 0) {
    steps.forEach((step: any) => {
      if (step.polyline?.points) {
        points.push(...decodePolyline(step.polyline.points));
      } else {
        if (step.start_location) points.push({ lat: step.start_location.lat, lng: step.start_location.lng });
        if (step.end_location) points.push({ lat: step.end_location.lat, lng: step.end_location.lng });
      }
    });
  }

  if (points.length === 0) {
    return { zoneIds: [], gantryIds: [] };
  }

  ZONE_CONFIGS.forEach((config) => {
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const dist = haversineKm(pt.lat, pt.lng, config.coord.lat, config.coord.lng);

      if (dist <= 0.18) {
        if (config.headingRange) {
          const prevPt = points[Math.max(0, i - 2)];
          const nextPt = points[Math.min(points.length - 1, i + 2)];
          const heading = calculateBearing(prevPt.lat, prevPt.lng, nextPt.lat, nextPt.lng);

          if (!isHeadingMatching(heading, config.headingRange.min, config.headingRange.max)) {
            continue;
          }
        }

        zoneSet.add(config.zoneId);
        config.gantryIds.forEach((id) => gantrySet.add(id));
        break;
      }
    }
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