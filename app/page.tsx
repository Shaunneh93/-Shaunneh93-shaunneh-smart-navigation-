'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';

const LIBRARIES: ("places")[] = ["places"];

export interface LtaErpRateItem {
  VehicleType: string;
  DayType: string;
  StartTime: string;
  EndTime: string;
  ZoneID: string;
  ChargeAmount: number;
}

export interface FuelPreset {
  id: string;
  label: string;
  consumptionKmL: number; // km/L
  consumptionLPer100Km: number; // L/100km
  isEv?: boolean;
}

const FUEL_PRESETS: FuelPreset[] = [
  { id: 'petrol_104kml', label: '🚗 Yeti (10.4 km/L / 9.6 L/100km)', consumptionKmL: 10.4, consumptionLPer100Km: 9.615 },
  { id: 'petrol_sedan', label: '🚘 Sedan (14.3 km/L / 7.0 L/100km)', consumptionKmL: 14.285, consumptionLPer100Km: 7.0 },
  { id: 'petrol_suv', label: '🚙 SUV / Crossover (11.8 km/L / 8.5 L/100km)', consumptionKmL: 11.765, consumptionLPer100Km: 8.5 },
  { id: 'hybrid', label: '⚡ Hybrid Car (25.0 km/L / 4.0 L/100km)', consumptionKmL: 25.0, consumptionLPer100Km: 4.0 },
  { id: 'ev', label: '🔋 Electric Vehicle (~0.15 kWh/km)', consumptionKmL: 0, consumptionLPer100Km: 0, isEv: true },
  { id: 'motorcycle', label: '🛵 Motorcycle (28.6 km/L / 3.5 L/100km)', consumptionKmL: 28.57, consumptionLPer100Km: 3.5 },
  { id: 'van', label: '🚐 Commercial Van (10.5 km/L / 9.5 L/100km)', consumptionKmL: 10.526, consumptionLPer100Km: 9.5 },
  { id: 'custom', label: '⚙️ Custom Fuel Efficiency', consumptionKmL: 10.4, consumptionLPer100Km: 9.615 },
];

export default function Home() {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES,
  });

  // 1. Google Maps State - Starts Completely BLANK
  const [originText, setOriginText] = useState('');
  const [originCoords, setOriginCoords] = useState<{ lat: string; lng: string }>({ lat: '', lng: '' });
  const originAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [destText, setDestText] = useState('');
  const [destCoords, setDestCoords] = useState<{ lat: string; lng: string }>({ lat: '', lng: '' });
  const destAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Route State
  const [routes, setRoutes] = useState<any[]>([]);
  const [winnerRouteId, setWinnerRouteId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Live LTA ERP State
  const [erpRates, setErpRates] = useState<LtaErpRateItem[]>([]);
  const [currentTime, setCurrentTime] = useState<string>('');
  const vehicleType = 'Passenger Cars'; // Hardcoded for cars as requested
  const [timeMode, setTimeMode] = useState<'live' | 'morning_peak' | 'evening_peak' | 'custom'>('live');
  const [customTime, setCustomTime] = useState<string>('08:30');
  const [selectedDayType, setSelectedDayType] = useState<string>('Weekdays');

  // Fuel Efficiency Estimation State
  const [fuelPreset, setFuelPreset] = useState<string>('petrol_104kml');
  const [fuelUnit, setFuelUnit] = useState<'kml' | 'l100km'>('kml');
  const [customKmL, setCustomKmL] = useState<number>(10.4);
  const [customConsumption, setCustomConsumption] = useState<number>(9.62);

  // Fetch ERP rates when vehicleType changes
  useEffect(() => {
    async function fetchLtaRates() {
      try {
        const res = await fetch(`/api/erp?vehicleType=${encodeURIComponent(vehicleType)}`);
        if (res.ok) {
          const data = await res.json();
          setErpRates(data.value || data.ERP || []);
        }
      } catch (err) {
        console.error('Failed to load live LTA rates:', err);
      }
    }
    fetchLtaRates();
  }, [vehicleType]);

  // Sync Singapore Time for live ERP window checks
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Singapore',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
      
      const dayOfWeek = now.getDay();
      if (dayOfWeek === 6) setSelectedDayType('Saturday');
      else if (dayOfWeek === 0) setSelectedDayType('Sunday');
      else setSelectedDayType('Weekdays');
    };

    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Compute live & peak ERP fees, scaled ERP penalty (5 PTS per $1), and dynamic composite score per route
  const { liveErpMap, routeErpSummaryMap, computedWinnerId } = useMemo(() => {
    if (routes.length === 0) {
      return { liveErpMap: {}, routeErpSummaryMap: {}, computedWinnerId: null };
    }

    const effectiveTimeStr = (
      timeMode === 'morning_peak'
        ? '08:30'
        : timeMode === 'evening_peak'
        ? '18:30'
        : timeMode === 'custom'
        ? customTime
        : currentTime
    ) || '08:30';

    const formattedTime = effectiveTimeStr.slice(0, 5);

    const costMap: Record<string, number> = {};
    const summaryMap: Record<
      string,
      {
        activeFee: number;
        maxPeakFee: number;
        erpPenalty: number;
        fuelLiters: number;
        baseFuelLiters: number;
        trafficOverheadLiters: number;
        fuelUnitText: string;
        trafficConditionText: string;
        avgSpeedKmH: number;
        speedFactor: number;
        fuelLabel: string;
        isEv: boolean;
        fuelPenalty: number;
        compositeScore: number;
        zones: Array<{ zoneId: string; name: string; activeFee: number; peakFee: number; gantries: number[] }>;
      }
    > = {};

    let minScore = Infinity;
    let bestRouteId: string | null = null;

    routes.forEach((route, idx) => {
      const routeKey = route.id || `route-${idx}`;

      // Grab unique detected zone strings
      const rawZones = route.zoneIds || route.erpZones || [];
      const uniqueZoneIds = Array.from(
        new Set(rawZones.map((z: any) => String(z).trim().toUpperCase()))
      );

      let totalActiveFee = 0;
      let totalMaxPeakFee = 0;
      const detectedZones: Array<{ zoneId: string; name: string; activeFee: number; peakFee: number; gantries: number[] }> = [];

      uniqueZoneIds.forEach((zoneId) => {
        // Find all matching rate entries for this zoneId in erpRates
        const zoneRates = erpRates.filter(
          (rate: any) =>
            String(rate.zoneId || rate.ZoneID || rate.ZoneId || '').trim().toUpperCase() === zoneId
        );

        // Max peak fee for this zone
        const peakFee = zoneRates.reduce(
          (max, r: any) => Math.max(max, Number(r.baseRate ?? r.ChargeAmount ?? r.Charge ?? 0)),
          0
        );

        // Active fee at effective time
        const activeRateItem = zoneRates.find((rate: any) => {
          const day = rate.dayType || rate.DayType;
          if (day && day !== selectedDayType && day !== 'Everyday') {
            return false;
          }
          const start = String(rate.startTime || rate.StartTime || '').slice(0, 5);
          const end = String(rate.endTime || rate.EndTime || '').slice(0, 5);
          if (!start || !end) return false;
          return formattedTime >= start && formattedTime < end;
        });

        const activeFee = activeRateItem
          ? Number((activeRateItem as any).baseRate ?? (activeRateItem as any).ChargeAmount ?? (activeRateItem as any).Charge ?? 0)
          : 0;

        totalActiveFee += activeFee;
        totalMaxPeakFee += peakFee;

        const zoneGantries = (zoneRates[0] as any)?.gantryIds || (zoneRates[0] as any)?.GantryIDs || (route.gantryIds || []);

        detectedZones.push({
          zoneId: String(zoneId),
          name: String(zoneId).replace(/_/g, ' '),
          activeFee,
          peakFee,
          gantries: Array.isArray(zoneGantries) ? zoneGantries : [],
        });
      });

      const durationMin = route.durationMin ?? 0;
      const intersectionScore = route.intersectionScore ?? route.trafficLightScore ?? 0;
      const distanceKm = Number(route.distanceKm ?? 0);

      // 🚗 Average Speed & Traffic Congestion Multiplier
      const avgSpeedKmH = durationMin > 0 ? (distanceKm / (durationMin / 60)) : 45;
      let speedFactor = 1.0;
      let trafficConditionText = 'Smooth flow';

      if (avgSpeedKmH < 20) {
        speedFactor = 1.35; // Heavy crawling congestion (+35% fuel)
        trafficConditionText = 'Heavy congestion (<20 km/h)';
      } else if (avgSpeedKmH < 35) {
        speedFactor = 1.20; // Stop-and-go urban traffic (+20% fuel)
        trafficConditionText = 'Slow traffic (20–35 km/h)';
      } else if (avgSpeedKmH < 50) {
        speedFactor = 1.10; // Moderate city traffic (+10% fuel)
        trafficConditionText = 'Moderate city traffic (35–50 km/h)';
      } else if (avgSpeedKmH <= 80) {
        speedFactor = 1.00; // Optimal cruising flow
        trafficConditionText = 'Cruising speed (50–80 km/h)';
      } else {
        speedFactor = 1.05; // High-speed drag (>80 km/h)
        trafficConditionText = 'High-speed expressway (>80 km/h)';
      }

      // ⛽ Base Consumption, Traffic Lights & Speed Factor Calculation
      const preset = FUEL_PRESETS.find((p) => p.id === fuelPreset) || FUEL_PRESETS[0];
      let fuelLiters = 0;
      let baseFuelLiters = 0;
      let trafficOverheadLiters = 0;
      let isEv = false;
      let fuelLabel = '';
      let fuelUnitText = 'L';

      if (preset.isEv) {
        isEv = true;
        fuelUnitText = 'kWh';
        const baseKwh = distanceKm * 0.15; // 0.15 kWh/km base
        const startStopKwh = intersectionScore * 0.005; // 0.005 kWh per traffic light
        const totalKwh = (baseKwh * speedFactor) + startStopKwh;
        fuelLiters = totalKwh;
        baseFuelLiters = baseKwh;
        trafficOverheadLiters = totalKwh - baseKwh;
        fuelLabel = `~${totalKwh.toFixed(2)} kWh (~${baseKwh.toFixed(2)} kWh base + ${trafficOverheadLiters.toFixed(2)} kWh traffic & lights)`;
      } else {
        let kmL = 10.4;
        if (fuelPreset === 'custom') {
          if (fuelUnit === 'kml') {
            kmL = customKmL > 0 ? customKmL : 10.4;
          } else {
            const l100 = customConsumption > 0 ? customConsumption : 9.62;
            kmL = 100 / l100;
          }
        } else {
          kmL = preset.consumptionKmL || (preset.consumptionLPer100Km > 0 ? 100 / preset.consumptionLPer100Km : 10.4);
        }

        baseFuelLiters = distanceKm / kmL;
        const startStopLiters = intersectionScore * 0.02; // ~20ml fuel per traffic light stop & go
        fuelLiters = (baseFuelLiters * speedFactor) + startStopLiters;
        trafficOverheadLiters = fuelLiters - baseFuelLiters;
        fuelLabel = `~${fuelLiters.toFixed(2)} L (~${baseFuelLiters.toFixed(2)} L base + ${trafficOverheadLiters.toFixed(2)} L traffic & ${intersectionScore} lights)`;
      }

      // 🔴 Penalties
      const erpPenalty = totalActiveFee * 5.0; // $1.00 ERP = 5.0 pts
      const fuelPenalty = isEv ? (fuelLiters * 3.0) : (fuelLiters * 10.0); // 1.0 L = 10.0 pts

      const compositeScore = Number(
        (
          durationMin * 1.0 +
          intersectionScore * 0.5 +
          distanceKm * 0.1 +
          erpPenalty +
          fuelPenalty
        ).toFixed(1)
      );

      if (compositeScore < minScore) {
        minScore = compositeScore;
        bestRouteId = routeKey;
      }

      costMap[routeKey] = totalActiveFee;
      summaryMap[routeKey] = {
        activeFee: totalActiveFee,
        maxPeakFee: totalMaxPeakFee,
        erpPenalty,
        fuelLiters,
        baseFuelLiters,
        trafficOverheadLiters,
        fuelUnitText,
        trafficConditionText,
        avgSpeedKmH,
        speedFactor,
        fuelLabel,
        isEv,
        fuelPenalty,
        compositeScore,
        zones: detectedZones,
      };
    });

    return { liveErpMap: costMap, routeErpSummaryMap: summaryMap, computedWinnerId: bestRouteId };
  }, [currentTime, erpRates, routes, timeMode, customTime, selectedDayType, fuelPreset, fuelUnit, customKmL, customConsumption]);

  const onOriginPlaceChanged = () => {
    if (originAutocompleteRef.current) {
      const place = originAutocompleteRef.current.getPlace();
      if (place && place.geometry && place.geometry.location) {
        setOriginCoords({
          lat: place.geometry.location.lat().toString(),
          lng: place.geometry.location.lng().toString()
        });
        setOriginText(place.formatted_address || place.name || '');
      }
    }
  };

  const onDestPlaceChanged = () => {
    if (destAutocompleteRef.current) {
      const place = destAutocompleteRef.current.getPlace();
      if (place && place.geometry && place.geometry.location) {
        setDestCoords({
          lat: place.geometry.location.lat().toString(),
          lng: place.geometry.location.lng().toString()
        });
        setDestText(place.formatted_address || place.name || '');
      }
    }
  };

  // Called ONLY when clicking "Use GPS" button
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setOriginText('📍 Fetching GPS location...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOriginCoords({
          lat: position.coords.latitude.toString(),
          lng: position.coords.longitude.toString()
        });
        setOriginText('📍 My Current Location');
      },
      (error) => {
        console.error("GPS Error:", error);
        alert("Unable to fetch your location. Please check browser permissions.");
        setOriginText('');
      },
      { enableHighAccuracy: true }
    );
  };

  const swapLocations = () => {
    const tempText = originText;
    const tempCoords = originCoords;
    setOriginText(destText);
    setOriginCoords(destCoords);
    setDestText(tempText);
    setDestCoords(tempCoords);
  };

  const handleSearch = async () => {
    if (!originCoords.lat || !destCoords.lat) {
      alert('Please select both a valid start location and destination.');
      return;
    }

    setLoading(true);
    try {
      const departureTime = new Date().toISOString();

      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: parseFloat(originCoords.lat), longitude: parseFloat(originCoords.lng) },
          destination: { latitude: parseFloat(destCoords.lat), longitude: parseFloat(destCoords.lng) },
          departureTime
        })
      });

      const data = await res.json();

      let allRoutes: any[] = [];
      let topWinner: any = null;

      if (data.allRoutes && Array.isArray(data.allRoutes)) {
        allRoutes = data.allRoutes;
      } else if (data.routes && Array.isArray(data.routes)) {
        allRoutes = data.routes;
      } else if (Array.isArray(data)) {
        allRoutes = data;
      } else if (data.result && Array.isArray(data.result)) {
        allRoutes = data.result;
      }

      topWinner = data.winner || data.optimal || allRoutes[0] || null;

      allRoutes = allRoutes.map((r, i) => ({
        ...r,
        id: r.id || `route-${i}`,
      }));

      if (topWinner && !topWinner.id) {
        topWinner.id = 'route-winner-0';
      }

      const winnerId = topWinner?.id || allRoutes[0]?.id || null;

      setRoutes(allRoutes);
      setWinnerRouteId(winnerId);
      setSelectedRouteId(winnerId);
    } catch (err) {
      console.error('Fetch error:', err);
      alert('Failed to calculate routes.');
    } finally {
      setLoading(false);
    }
  };

  const launchGoogleMaps = (route: any, mode: 'via' | 'direct' = 'via') => {
    const destLat = route?.destinationCoords?.latitude || destCoords.lat;
    const destLng = route?.destinationCoords?.longitude || destCoords.lng;
    const origLat = route?.originCoords?.latitude || originCoords.lat;
    const origLng = route?.originCoords?.longitude || originCoords.lng;

    // Always prefer exact numeric lat,lng coordinates so Google Maps routes directly without trying to parse display labels like "📍 My Current Location"
    const originParam = (origLat && origLng) 
      ? `${origLat},${origLng}` 
      : encodeURIComponent(originText);

    const destParam = (destLat && destLng) 
      ? `${destLat},${destLng}` 
      : encodeURIComponent(destText);

    let mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destParam}&travelmode=driving`;

    if (mode === 'via' && route?.waypoints && Array.isArray(route.waypoints) && route.waypoints.length > 0) {
      const wp = route.waypoints[0];
      if (wp?.latitude && wp?.longitude) {
        // Clean lat,lng coordinates for waypoints
        mapsUrl += `&waypoints=${wp.latitude},${wp.longitude}`;
      }
    }

    window.open(mapsUrl, '_blank');
  };

  if (loadError) return <div style={{ color: '#ef4444', padding: '20px', textAlign: 'center' }}>Error loading Google Maps API. Check API Restrictions in Console.</div>;
  if (!isLoaded) return <div style={{ color: '#f8fafc', padding: '40px 20px', textAlign: 'center', fontSize: '16px' }}>⌛ Loading Google Maps...</div>;

  const isFormValid = Boolean(originCoords.lat && destCoords.lat);

  return (
    <main style={{ width: '100%', maxWidth: '540px', margin: '0 auto', padding: '12px 12px 32px 12px', boxSizing: 'border-box', overflowX: 'hidden', color: '#f8fafc' }}>
      {/* HEADER BAR */}
      <header style={{ textAlign: 'center', marginBottom: '14px', paddingTop: '4px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', color: '#38bdf8', marginBottom: '6px', maxWidth: '100%', boxSizing: 'border-box' }}>
          <span>🇸🇬 Singapore ERP & Toll Route Optimizer</span>
        </div>
        <h1 style={{ fontSize: '26px', fontWeight: '800', margin: '0 0 2px 0', letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          NEHvigation
        </h1>
        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>Real-time LTA ERP gantries + Smart waypoint navigation</p>
      </header>

      {/* LOCATION SETUP CARD WITH SWAP */}
      <section style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#0f172a', padding: '14px 12px', borderRadius: '12px', marginBottom: '12px', border: '1px solid #334155', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
        {/* START LOCATION */}
        <div style={{ marginBottom: '8px', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '6px', width: '100%', boxSizing: 'border-box' }}>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🟢</span> Start Location
            </label>
            <button 
              type="button"
              onClick={useCurrentLocation}
              style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              🎯 Use GPS
            </button>
          </div>

          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <Autocomplete
              onLoad={(autocomplete) => (originAutocompleteRef.current = autocomplete)}
              onPlaceChanged={onOriginPlaceChanged}
              options={{ componentRestrictions: { country: 'sg' } }}
            >
              <input 
                type="text" 
                placeholder="Type start address or tap 'Use GPS'..." 
                value={originText} 
                onChange={(e) => {
                  setOriginText(e.target.value);
                  setOriginCoords({ lat: '', lng: '' });
                }}
                style={{ width: '100%', height: '48px', padding: '0 12px', borderRadius: '8px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#fff', boxSizing: 'border-box' }}
              />
            </Autocomplete>
          </div>
        </div>

        {/* SWAP LOCATIONS BUTTON */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0', width: '100%' }}>
          <button
            type="button"
            onClick={swapLocations}
            title="Swap Start & Destination"
            style={{
              minHeight: '34px',
              padding: '4px 14px',
              fontSize: '12px',
              backgroundColor: '#1e293b',
              color: '#38bdf8',
              border: '1px solid #334155',
              borderRadius: '20px',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ⇅ Swap Locations
          </button>
        </div>

        {/* DESTINATION */}
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#ef4444', marginBottom: '6px' }}>🔴 Destination</label>

          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <Autocomplete
              onLoad={(autocomplete) => (destAutocompleteRef.current = autocomplete)}
              onPlaceChanged={onDestPlaceChanged}
              options={{ componentRestrictions: { country: 'sg' } }}
            >
              <input 
                type="text" 
                placeholder="Search destination address..." 
                value={destText} 
                onChange={(e) => {
                  setDestText(e.target.value);
                  setDestCoords({ lat: '', lng: '' });
                }}
                style={{ width: '100%', height: '48px', padding: '0 12px', borderRadius: '8px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#fff', boxSizing: 'border-box' }}
              />
            </Autocomplete>
          </div>
        </div>
      </section>

      {/* ERP DEPARTURE WINDOW CARD */}
      <section style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#0f172a', padding: '14px 12px', borderRadius: '12px', marginBottom: '12px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '10px', width: '100%', boxSizing: 'border-box' }}>
          <label style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.3px' }}>
            🕒 ERP DEPARTURE WINDOW
          </label>
          <span style={{ fontSize: '11px', backgroundColor: '#1e293b', color: '#38bdf8', padding: '3px 8px', borderRadius: '6px', border: '1px solid #0284c7', fontWeight: '600' }}>
            🚗 Passenger Cars
          </span>
        </div>

        {/* SCROLLABLE PILLS FOR MOBILE */}
        <div className="no-scrollbar" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', width: '100%', boxSizing: 'border-box' }}>
          {[
            { mode: 'live', label: `🟢 Live (${currentTime || 'SG Time'})` },
            { mode: 'morning_peak', label: '🌅 Morning Peak (08:30)' },
            { mode: 'evening_peak', label: '🌆 Evening Peak (18:30)' },
            { mode: 'custom', label: '⏱️ Custom' },
          ].map((item) => (
            <button
              key={item.mode}
              type="button"
              onClick={() => setTimeMode(item.mode as any)}
              style={{
                minHeight: '40px',
                padding: '0 12px',
                fontSize: '12px',
                borderRadius: '8px',
                whiteSpace: 'nowrap',
                border: timeMode === item.mode ? '1.5px solid #22c55e' : '1px solid #334155',
                backgroundColor: timeMode === item.mode ? '#15803d' : '#1e293b',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: timeMode === item.mode ? '700' : '500',
                boxShadow: timeMode === item.mode ? '0 0 8px rgba(34,197,94,0.3)' : 'none',
                flexShrink: 0
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {timeMode === 'custom' && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', width: '100%', boxSizing: 'border-box' }}>
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              style={{
                height: '42px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #475569',
                backgroundColor: '#1e293b',
                color: '#fff',
                fontSize: '14px',
                flex: 1,
                minWidth: 0
              }}
            />
            <select
              value={selectedDayType}
              onChange={(e) => setSelectedDayType(e.target.value)}
              style={{
                height: '42px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #475569',
                backgroundColor: '#1e293b',
                color: '#fff',
                fontSize: '14px',
                flex: 1,
                minWidth: 0
              }}
            >
              <option value="Weekdays">Weekdays</option>
              <option value="Saturday">Saturday</option>
              <option value="Sunday">Sunday</option>
            </select>
          </div>
        )}
      </section>

      {/* FUEL CONSUMPTION CARD */}
      <section style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#0f172a', padding: '14px 12px', borderRadius: '12px', marginBottom: '16px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', width: '100%', boxSizing: 'border-box' }}>
          <label style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8' }}>
            ⛽ FUEL CONSUMPTION & EFFICIENCY
          </label>
        </div>

        <select
          value={fuelPreset}
          onChange={(e) => setFuelPreset(e.target.value)}
          style={{
            width: '100%',
            height: '44px',
            padding: '0 10px',
            borderRadius: '8px',
            border: '1px solid #475569',
            backgroundColor: '#1e293b',
            color: '#fff',
            fontSize: '13px',
            boxSizing: 'border-box'
          }}
        >
          {FUEL_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>

        {fuelPreset === 'custom' && (
          <div style={{ marginTop: '10px', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
              <label style={{ fontSize: '11px', color: '#94a3b8' }}>Custom Value:</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setFuelUnit('kml')}
                  style={{
                    fontSize: '11px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: '1px solid #475569',
                    backgroundColor: fuelUnit === 'kml' ? '#0284c7' : '#1e293b',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: fuelUnit === 'kml' ? 'bold' : 'normal',
                  }}
                >
                  km/L
                </button>
                <button
                  type="button"
                  onClick={() => setFuelUnit('l100km')}
                  style={{
                    fontSize: '11px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: '1px solid #475569',
                    backgroundColor: fuelUnit === 'l100km' ? '#0284c7' : '#1e293b',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: fuelUnit === 'l100km' ? 'bold' : 'normal',
                  }}
                >
                  L/100km
                </button>
              </div>
            </div>

            {fuelUnit === 'kml' ? (
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="50"
                value={customKmL}
                onChange={(e) => {
                  const val = Number(e.target.value) || 10.4;
                  setCustomKmL(val);
                  setCustomConsumption(Number((100 / val).toFixed(2)));
                }}
                placeholder="e.g. 10.4 km/L"
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: '1px solid #0284c7',
                  backgroundColor: '#1e293b',
                  color: '#fff',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="30"
                value={customConsumption}
                onChange={(e) => {
                  const val = Number(e.target.value) || 9.62;
                  setCustomConsumption(val);
                  setCustomKmL(Number((100 / val).toFixed(1)));
                }}
                placeholder="e.g. 9.6 L/100km"
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: '1px solid #0284c7',
                  backgroundColor: '#1e293b',
                  color: '#fff',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            )}
          </div>
        )}

        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px', lineHeight: '1.4' }}>
          💡 <em>Includes extra fuel overhead for crawling traffic (&lt;35 km/h) & traffic light idling (~20ml/light).</em>
        </div>
      </section>

      {/* MAIN ACTION BUTTON */}
      <button 
        type="button"
        onClick={handleSearch}
        disabled={loading || !isFormValid}
        style={{
          width: '100%',
          height: '52px',
          fontSize: '16px',
          cursor: (loading || !isFormValid) ? 'not-allowed' : 'pointer',
          borderRadius: '10px',
          border: 'none',
          background: (loading || !isFormValid) 
            ? '#475569' 
            : 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
          color: '#ffffff',
          fontWeight: '700',
          boxShadow: isFormValid ? '0 4px 20px rgba(2, 132, 199, 0.4)' : 'none',
          opacity: isFormValid ? 1 : 0.6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'transform 0.1s ease, box-shadow 0.15s ease'
        }}
      >
        {loading ? (
          <>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚡</span>
            <span>Evaluating All Routes...</span>
          </>
        ) : (
          <span>Calculate Best Routes</span>
        )}
      </button>

      {/* ROUTE RESULTS */}
      {routes.length > 0 && (
        <section style={{ marginTop: '20px', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '12px', width: '100%', boxSizing: 'border-box' }}>
            <h2 style={{ fontSize: '17px', margin: 0, fontWeight: '700', color: '#f8fafc' }}>
              Considered Routes ({routes.length})
            </h2>
            {currentTime && (
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                SG Time: {currentTime}
              </span>
            )}
          </div>

          {routes.map((route, idx) => {
            const routeKey = route.id || `route-${idx}`;
            const effectiveWinnerId = computedWinnerId || winnerRouteId;
            const isWinner = effectiveWinnerId ? routeKey === effectiveWinnerId : idx === 0;
            const isSelected = selectedRouteId === routeKey;

            const erpSummary = routeErpSummaryMap[routeKey];
            const activeErpFee = erpSummary?.activeFee ?? liveErpMap[routeKey] ?? route.erpTotalCost ?? route.erpFee ?? 0;
            const maxPeakFee = erpSummary?.maxPeakFee ?? 0;
            const detectedZones = erpSummary?.zones || [];
            const fuelLiters = erpSummary?.fuelLiters ?? 0;
            const baseFuelLiters = erpSummary?.baseFuelLiters ?? 0;
            const trafficOverheadLiters = erpSummary?.trafficOverheadLiters ?? 0;
            const fuelUnitText = erpSummary?.fuelUnitText ?? 'L';
            const trafficConditionText = erpSummary?.trafficConditionText ?? '';
            const avgSpeedKmH = erpSummary?.avgSpeedKmH ?? 0;
            const isEv = erpSummary?.isEv ?? false;
            const erpPenalty = erpSummary?.erpPenalty ?? (activeErpFee * 5.0);
            const fuelPenalty = erpSummary?.fuelPenalty ?? (isEv ? fuelLiters * 3.0 : fuelLiters * 10.0);
            const totalCostPenalty = erpPenalty + fuelPenalty;
            const displayCompositeScore = erpSummary?.compositeScore ?? route.compositeScore;
            const intersectionScore = route.intersectionScore ?? route.trafficLightScore ?? 0;

            return (
              <article 
                key={routeKey}
                onClick={() => setSelectedRouteId(routeKey)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '14px 12px',
                  marginBottom: '14px',
                  borderRadius: '12px',
                  backgroundColor: isSelected ? '#1e293b' : '#0f172a',
                  border: isWinner 
                    ? '2px solid #22c55e' 
                    : isSelected 
                      ? '2px solid #38bdf8' 
                      : '1px solid #334155',
                  boxShadow: isWinner ? '0 0 16px rgba(34, 197, 94, 0.2)' : 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s ease-in-out',
                  overflow: 'hidden'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', width: '100%', boxSizing: 'border-box' }}>
                  <span style={{ fontWeight: '700', fontSize: '15px', color: isWinner ? '#4ade80' : '#38bdf8' }}>
                    {route.summary || route.via || route.label || `Route Option ${idx + 1}`}
                  </span>
                  
                  {isWinner ? (
                    <span style={{ backgroundColor: '#16a34a', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '3px 10px', borderRadius: '12px' }}>
                      ⭐ Optimal Route
                    </span>
                  ) : (
                    <span style={{ backgroundColor: '#334155', color: '#94a3b8', fontSize: '11px', padding: '3px 8px', borderRadius: '12px' }}>
                      Alternative
                    </span>
                  )}
                </div>

                <div style={{ color: '#f1f5f9', fontSize: '13px', lineHeight: '1.6', width: '100%', boxSizing: 'border-box' }}>
                  <div>⏱️ <strong>Time:</strong> {route.durationMin !== undefined ? Number(route.durationMin).toFixed(0) : route.duration || 'N/A'} mins ({avgSpeedKmH.toFixed(0)} km/h avg speed)</div>
                  <div>🛣️ <strong>Distance:</strong> {route.distanceKm !== undefined ? Number(route.distanceKm).toFixed(1) : route.distance || 'N/A'} km</div>
                  
                  {/* ERP & Fuel Consumption Breakdown Box */}
                  <div style={{ backgroundColor: '#0b1329', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', margin: '8px 0', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                      <span style={{ fontSize: '12px' }}>💳 Active ERP Toll:</span>
                      <span style={{ color: activeErpFee > 0 ? '#fbbf24' : '#34d399', fontWeight: 'bold', fontSize: '14px' }}>
                        ${Number(activeErpFee).toFixed(2)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
                      <span style={{ fontSize: '12px' }}>{isEv ? '🔋 Energy Consumed:' : '⛽ Fuel Consumed:'}</span>
                      <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '14px' }}>
                        ~{Number(fuelLiters).toFixed(2)} {fuelUnitText}
                      </span>
                    </div>

                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', lineHeight: '1.4' }}>
                      📊 Base: ~{baseFuelLiters.toFixed(2)} {fuelUnitText} | Traffic & {intersectionScore} lights: <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>+{trafficOverheadLiters.toFixed(2)} {fuelUnitText}</span> ({trafficConditionText})
                    </div>

                    {maxPeakFee > 0 && activeErpFee === 0 && (
                      <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '6px' }}>
                        ℹ️ Off-peak at selected time. <strong>Peak rate during operating hours: ${Number(maxPeakFee).toFixed(2)}</strong>
                      </div>
                    )}

                    {/* Detected Gantries / Zones List */}
                    {detectedZones.length > 0 ? (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #1e293b', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}>
                        <div style={{ color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>📍 DETECTED ERP ZONES ({detectedZones.length}):</div>
                        {detectedZones.map((z) => (
                          <div key={z.zoneId} style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', padding: '2px 0', flexWrap: 'wrap', gap: '4px' }}>
                            <span style={{ wordBreak: 'break-word' }}>• {z.name} {z.gantries.length > 0 ? `(#${z.gantries.join(', #')})` : ''}</span>
                            <span style={{ color: z.activeFee > 0 ? '#f59e0b' : '#38bdf8', fontWeight: 'bold' }}>
                              ${z.activeFee.toFixed(2)} {z.activeFee === 0 ? `(Peak $${z.peakFee.toFixed(2)})` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px' }}>
                        ✅ Toll-Free Route (No ERP Gantries Detected)
                      </div>
                    )}
                  </div>

                  {/* 🚦 Traffic Light Score */}
                  <div>
                    🚦 <strong>Traffic Light Score:</strong>{' '}
                    {(route.intersectionScore !== undefined && route.intersectionScore !== null)
                      ? route.intersectionScore
                      : (route.trafficLightScore !== undefined && route.trafficLightScore !== null)
                        ? route.trafficLightScore
                        : 'N/A'}
                  </div>

                  {/* ⚠️ Total Cost Penalty Indicator */}
                  <div>
                    ⚠️ <strong>Toll & Fuel Penalty:</strong>{' '}
                    {totalCostPenalty > 0 ? (
                      <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                        +{totalCostPenalty.toFixed(1)} pts (${activeErpFee.toFixed(2)} ERP + {fuelLiters.toFixed(2)} {fuelUnitText})
                      </span>
                    ) : (
                      <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                        0.0 pts ($0 Toll & Minimal Fuel)
                      </span>
                    )}
                  </div>

                  {/* 📊 Composite / Weighted Score */}
                  {(displayCompositeScore !== undefined || route.score !== undefined) && (
                    <div 
                      style={{ 
                        color: '#38bdf8', 
                        fontSize: '13px', 
                        marginTop: '6px', 
                        fontWeight: 'bold', 
                        borderTop: '1px solid #334155', 
                        paddingTop: '6px' 
                      }}
                    >
                      📊 <strong>Composite Score:</strong>{' '}
                      {Number(displayCompositeScore ?? route.score).toFixed(1)} pts
                    </div>
                  )}
                </div>

                {/* MOBILE ACTION BUTTONS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
                  <button 
                    type="button"
                    title="Opens Google Maps routed through key expressway waypoint"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRouteId(routeKey);
                      launchGoogleMaps(route, 'via');
                    }}
                    style={{
                      width: '100%',
                      minHeight: '48px',
                      padding: '10px 14px',
                      backgroundColor: isWinner ? '#16a34a' : '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '700',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: isWinner ? '0 4px 12px rgba(22, 163, 74, 0.3)' : 'none'
                    }}
                  >
                    🧭 Navigate via Waypoint
                  </button>
                  <button 
                    type="button"
                    title="Opens Google Maps with direct Origin & Destination"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRouteId(routeKey);
                      launchGoogleMaps(route, 'direct');
                    }}
                    style={{
                      width: '100%',
                      minHeight: '42px',
                      padding: '8px 14px',
                      backgroundColor: '#1e293b',
                      color: '#94a3b8',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    📍 Direct A-to-B
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}