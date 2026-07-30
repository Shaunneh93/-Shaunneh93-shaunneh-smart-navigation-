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
  const [timeMode, setTimeMode] = useState<'live' | 'morning_peak' | 'evening_peak' | 'custom'>('morning_peak');
  const [customTime, setCustomTime] = useState<string>('08:30');
  const [selectedDayType, setSelectedDayType] = useState<string>('Weekdays');

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
          (rate: any) => String(rate.ZoneID || rate.ZoneId || '').trim().toUpperCase() === zoneId
        );

        // Max peak fee for this zone
        const peakFee = zoneRates.reduce(
          (max, r: any) => Math.max(max, Number(r.ChargeAmount || r.Charge || 0)),
          0
        );

        // Active fee at effective time
        const activeRateItem = zoneRates.find((rate: any) => {
          if (rate.DayType && rate.DayType !== selectedDayType && rate.DayType !== 'Everyday') {
            return false;
          }
          const start = String(rate.StartTime || '').slice(0, 5);
          const end = String(rate.EndTime || '').slice(0, 5);
          if (!start || !end) return false;
          return formattedTime >= start && formattedTime < end;
        });

        const activeFee = activeRateItem ? Number((activeRateItem as any).ChargeAmount || (activeRateItem as any).Charge || 0) : 0;

        totalActiveFee += activeFee;
        totalMaxPeakFee += peakFee;

        const zoneGantries = (zoneRates[0] as any)?.GantryIDs || (route.gantryIds || []);

        detectedZones.push({
          zoneId: String(zoneId),
          name: String(zoneId).replace(/_/g, ' '),
          activeFee,
          peakFee,
          gantries: Array.isArray(zoneGantries) ? zoneGantries : [],
        });
      });

      // 🔴 Scaled ERP Penalty: $1.00 ERP = 5.0 PTS
      const erpPenalty = totalActiveFee * 5.0;

      const durationMin = route.durationMin ?? 0;
      const intersectionScore = route.intersectionScore ?? route.trafficLightScore ?? 0;
      const distanceKm = Number(route.distanceKm ?? 0);

      const compositeScore = Number(
        (
          durationMin * 1.0 +
          intersectionScore * 0.5 +
          distanceKm * 0.2 +
          erpPenalty
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
        compositeScore,
        zones: detectedZones,
      };
    });

    return { liveErpMap: costMap, routeErpSummaryMap: summaryMap, computedWinnerId: bestRouteId };
  }, [currentTime, erpRates, routes, timeMode, customTime, selectedDayType]);

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

  const launchGoogleMaps = (route: any) => {
    const dest = route?.destinationCoords || { latitude: destCoords.lat, longitude: destCoords.lng };
    const orig = route?.originCoords || { latitude: originCoords.lat, longitude: originCoords.lng };

    let mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${orig.latitude},${orig.longitude}&destination=${dest.latitude},${dest.longitude}&travelmode=driving`;

    if (route?.waypoints && Array.isArray(route.waypoints) && route.waypoints.length > 0) {
      const total = route.waypoints.length;
      const midPoint = route.waypoints[Math.floor(total / 2)];
      
      if (midPoint?.latitude && midPoint?.longitude) {
        const waypointsString = `${midPoint.latitude},${midPoint.longitude}`;
        mapsUrl += `&waypoints=${encodeURIComponent(waypointsString)}`;
      }
    } else if (route?.via && typeof route.via === 'string') {
      mapsUrl += `&via=${encodeURIComponent(route.via)}`;
    }

    window.open(mapsUrl, '_blank');
  };

  if (loadError) return <div style={{ color: 'red', padding: '20px' }}>Error loading Google Maps API. Check API Restrictions in Console.</div>;
  if (!isLoaded) return <div style={{ color: '#fff', padding: '20px', textAlign: 'center' }}>Loading Google Maps...</div>;

  const isFormValid = Boolean(originCoords.lat && destCoords.lat);

  return (
    <main style={{ padding: '30px 20px', fontFamily: 'sans-serif', maxWidth: '500px', margin: '0 auto', color: '#ffffff' }}>
      <h1 style={{ textAlign: 'center', fontSize: '24px', marginBottom: '20px' }}>NEHvigation</h1>

      {/* ERP TIME & VEHICLE CONTROLS */}
      <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8' }}>
            🕒 ERP DEPARTURE WINDOW
          </label>
          <span style={{ fontSize: '11px', backgroundColor: '#1e293b', color: '#38bdf8', padding: '4px 8px', borderRadius: '6px', border: '1px solid #0284c7', fontWeight: 'bold' }}>
            🚗 Passenger Cars
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: timeMode === 'custom' ? '10px' : '0' }}>
          {[
            { mode: 'morning_peak', label: '🌅 Morning Peak (08:30)' },
            { mode: 'evening_peak', label: '🌆 Evening Peak (18:30)' },
            { mode: 'live', label: `🟢 Live SG (${currentTime || 'SG Time'})` },
            { mode: 'custom', label: '⏱️ Custom' },
          ].map((item) => (
            <button
              key={item.mode}
              type="button"
              onClick={() => setTimeMode(item.mode as any)}
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                borderRadius: '6px',
                border: timeMode === item.mode ? '1px solid #22c55e' : '1px solid #334155',
                backgroundColor: timeMode === item.mode ? '#15803d' : '#1e293b',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: timeMode === item.mode ? 'bold' : 'normal',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {timeMode === 'custom' && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #475569',
                backgroundColor: '#1e293b',
                color: '#fff',
                fontSize: '13px',
              }}
            />
            <select
              value={selectedDayType}
              onChange={(e) => setSelectedDayType(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #475569',
                backgroundColor: '#1e293b',
                color: '#fff',
                fontSize: '13px',
              }}
            >
              <option value="Weekdays">Weekdays</option>
              <option value="Saturday">Saturday</option>
              <option value="Sunday">Sunday</option>
            </select>
          </div>
        )}
      </div>

      {/* START LOCATION SEARCH */}
      <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8' }}>🟢 Start Location</label>
          <button 
            type="button"
            onClick={useCurrentLocation}
            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            🎯 Use GPS
          </button>
        </div>

        <Autocomplete
          onLoad={(autocomplete) => (originAutocompleteRef.current = autocomplete)}
          onPlaceChanged={onOriginPlaceChanged}
          options={{ componentRestrictions: { country: 'sg' } }}
        >
          <input 
            type="text" 
            placeholder="Type start address or click 'Use GPS'..." 
            value={originText} 
            onChange={(e) => {
              setOriginText(e.target.value);
              // Reset stored coords if user types manually so they pick a valid place
              setOriginCoords({ lat: '', lng: '' });
            }}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#fff', boxSizing: 'border-box' }}
          />
        </Autocomplete>
      </div>

      {/* DESTINATION SEARCH */}
      <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #334155' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#ef4444', marginBottom: '8px' }}>🔴 Destination</label>

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
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#fff', boxSizing: 'border-box' }}
          />
        </Autocomplete>
      </div>

      {/* CALCULATE BUTTON */}
      <button 
        type="button"
        onClick={handleSearch}
        disabled={loading || !isFormValid}
        style={{
          padding: '14px 20px',
          fontSize: '16px',
          cursor: (loading || !isFormValid) ? 'not-allowed' : 'pointer',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: (loading || !isFormValid) ? '#475569' : '#0070f3',
          color: '#ffffff',
          fontWeight: 'bold',
          width: '100%',
          boxShadow: '0 4px 12px rgba(0, 112, 243, 0.3)',
          opacity: isFormValid ? 1 : 0.6
        }}
      >
        {loading ? 'Evaluating All Routes...' : 'Calculate Routes'}
      </button>

      {/* ROUTE RESULTS LIST */}
      {routes.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '18px', margin: 0, color: '#e0e0e0' }}>
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

  // 🔴 1 Dollar of ERP = 5 Penalty Points
  const calculatedErpPenalty = erpSummary?.erpPenalty ?? (activeErpFee * 5.0);
  const displayCompositeScore = erpSummary?.compositeScore ?? route.compositeScore;

  return (
              <div 
                key={routeKey}
                onClick={() => setSelectedRouteId(routeKey)}
                style={{
                  padding: '16px',
                  marginBottom: '16px',
                  borderRadius: '12px',
                  backgroundColor: isSelected ? '#1e293b' : '#0f172a',
                  border: isWinner 
                    ? '2px solid #22c55e' 
                    : isSelected 
                      ? '2px solid #38bdf8' 
                      : '1px solid #334155',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'border 0.15s ease-in-out'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '16px', color: isWinner ? '#4ade80' : '#38bdf8' }}>
                    {route.summary || route.via || route.label || `Route Option ${idx + 1}`}
                  </span>
                  
                  {isWinner ? (
                    <span style={{ backgroundColor: '#16a34a', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '12px' }}>
                      ⭐ Optimal Route
                    </span>
                  ) : (
                    <span style={{ backgroundColor: '#334155', color: '#94a3b8', fontSize: '11px', padding: '3px 8px', borderRadius: '12px' }}>
                      Alternative
                    </span>
                  )}
                </div>

<div style={{ color: '#f1f5f9', fontSize: '14px', lineHeight: '1.8' }}>
  <div>⏱️ <strong>Time:</strong> {route.durationMin !== undefined ? Number(route.durationMin).toFixed(0) : route.duration || 'N/A'} mins</div>
  <div>🛣️ <strong>Distance:</strong> {route.distanceKm !== undefined ? Number(route.distanceKm).toFixed(1) : route.distance || 'N/A'} km</div>
  
  {/* ERP Fee Breakdown */}
  <div style={{ backgroundColor: '#0b1329', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', margin: '8px 0' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontWeight: 'bold' }}>💰 Active ERP Fee ({timeMode === 'morning_peak' ? '08:30 Peak' : timeMode === 'evening_peak' ? '18:30 Peak' : timeMode === 'custom' ? customTime : 'Live SG'}):</span>
      <span style={{ color: activeErpFee > 0 ? '#fbbf24' : '#34d399', fontWeight: 'bold', fontSize: '15px' }}>
        ${Number(activeErpFee).toFixed(2)}
      </span>
    </div>

    {maxPeakFee > 0 && activeErpFee === 0 && (
      <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '4px' }}>
        ℹ️ Off-peak at selected time. <strong>Peak rate during operating hours: ${Number(maxPeakFee).toFixed(2)}</strong>
      </div>
    )}

    {/* Detected Gantries / Zones List */}
    {detectedZones.length > 0 ? (
      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #1e293b', fontSize: '12px' }}>
        <div style={{ color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>📍 DETECTED ERP ZONES ({detectedZones.length}):</div>
        {detectedZones.map((z) => (
          <div key={z.zoneId} style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', padding: '2px 0' }}>
            <span>• {z.name} {z.gantries.length > 0 ? `(#${z.gantries.join(', #')})` : ''}</span>
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

{/* ⚠️ ERP Penalty Indicator */}
<div>
  ⚠️ <strong>ERP Penalty:</strong>{' '}
  {calculatedErpPenalty > 0 ? (
    <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
      +{calculatedErpPenalty.toFixed(1)} pts (${activeErpFee.toFixed(2)} @ 5.0 pts/$1)
    </span>
  ) : (
    <span style={{ color: '#10b981', fontWeight: 'bold' }}>
      0.0 pts ($0 Toll)
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

                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedRouteId(routeKey);
                    launchGoogleMaps(route);
                  }}
                  style={{
                    marginTop: '14px',
                    padding: '10px 16px',
                    backgroundColor: isWinner ? '#16a34a' : '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    width: '100%',
                    fontSize: '14px'
                  }}
                >
                  Navigate This Route
                </button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}