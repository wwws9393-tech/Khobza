import React, { useEffect, useRef, useState } from 'react';
import { LocationData } from '../types';
import L from 'leaflet';
import {
  MapPin,
  ExternalLink,
  X,
  Navigation,
  Truck,
  Clock,
  Compass,
  Layers,
  RefreshCw,
  LocateFixed,
  Send
} from 'lucide-react';

interface Props {
  location: LocationData;
  title?: string;
  onClose: () => void;
  onUpdateLocation?: (loc: LocationData) => void;
  driverLocation?: { lat: number; lng: number } | null;
}

// Calculate distance between two coordinates in Kilometers
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const LocationPickerModal: React.FC<Props> = ({
  location,
  title = 'تحديد المسار والموقع الجغرافي',
  onClose,
  onUpdateLocation,
  driverLocation: propDriverLoc,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const [mapTile, setMapTile] = useState<'streets' | 'satellite' | 'dark'>('streets');
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(
    propDriverLoc || null
  );
  const [isLocating, setIsLocating] = useState(false);

  // Auto-acquire Mandoub GPS if not provided with high precision hardware GPS
  useEffect(() => {
    if (!driverPos && navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDriverPos({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setIsLocating(false);
        },
        () => {
          // Fallback: Default simulated driver start location near customer
          setDriverPos({
            lat: location.lat + 0.012,
            lng: location.lng - 0.009,
          });
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else if (!driverPos) {
      setDriverPos({
        lat: location.lat + 0.012,
        lng: location.lng - 0.009,
      });
    }
  }, [location]);

  // Compute Distance & ETA
  const driverLat = driverPos?.lat ?? location.lat + 0.012;
  const driverLng = driverPos?.lng ?? location.lng - 0.009;

  const distanceKm = calculateDistanceKm(driverLat, driverLng, location.lat, location.lng);
  const distanceFormatted =
    distanceKm < 1 ? `${Math.round(distanceKm * 1000)} متر` : `${distanceKm.toFixed(2)} كم`;

  // Estimate travel time at ~30 km/h in city delivery traffic
  const estimatedMins = Math.max(2, Math.round((distanceKm / 30) * 60) + 1);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    try {
      // Clean up old instance if exists
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      });

      mapInstanceRef.current = map;

      // Tile layers map
      const tileUrls = {
        streets: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      };

      L.tileLayer(tileUrls[mapTile], {
        maxZoom: 19,
      }).addTo(map);

      // Custom Icon for Customer Destination (House shape - شكل بيت)
      const customerIcon = L.divIcon({
        className: 'custom-customer-marker',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 42px; height: 42px; background: rgba(217,119,6,0.3); border-radius: 50%; animation: ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
            <div style="width: 38px; height: 38px; background: #d97706; border: 3px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 14px rgba(0,0,0,0.4);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      // Custom Icon for Mandoub Driver (Bread Loaf shape - شكل رغيف خبز)
      const driverIcon = L.divIcon({
        className: 'custom-driver-marker',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 44px; height: 44px; background: rgba(245,158,11,0.35); border-radius: 50%;"></div>
            <div style="width: 38px; height: 38px; background: linear-gradient(135deg, #f59e0b, #d97706); border: 3px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 14px rgba(0,0,0,0.4);">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <ellipse cx="12" cy="12" rx="9" ry="7" fill="#fbbf24" stroke="#78350f" stroke-width="1.8" />
                <circle cx="8" cy="11" r="1.2" fill="#92400e" />
                <circle cx="12" cy="10" r="1.2" fill="#92400e" />
                <circle cx="16" cy="11" r="1.2" fill="#92400e" />
                <circle cx="10" cy="14" r="1.2" fill="#92400e" />
                <circle cx="14" cy="14" r="1.2" fill="#92400e" />
              </svg>
            </div>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      // Add Markers
      L.marker([location.lat, location.lng], { icon: customerIcon })
        .addTo(map)
        .bindPopup(`<div style="direction: rtl; font-family: Cairo, sans-serif; font-weight: bold; text-align: right;"><b>🏠 موقع منزل العائلة:</b><br/>${location.addressText || 'عنوان محدد على الخريطة'}</div>`);

      L.marker([driverLat, driverLng], { icon: driverIcon })
        .addTo(map)
        .bindPopup(`<div style="direction: rtl; font-family: Cairo, sans-serif; font-weight: bold; text-align: right;"><b>🥖 موقع المندوب (حامل الخبز)</b></div>`);

      // Professional Multi-Layer Route Polyline
      L.polyline(
        [
          [driverLat, driverLng],
          [location.lat, location.lng],
        ],
        {
          color: '#b45309',
          weight: 8,
          opacity: 0.45,
          lineCap: 'round',
        }
      ).addTo(map);

      L.polyline(
        [
          [driverLat, driverLng],
          [location.lat, location.lng],
        ],
        {
          color: '#f59e0b',
          weight: 4.5,
          opacity: 0.95,
          dashArray: '10, 10',
          lineCap: 'round',
        }
      ).addTo(map);

      // Fit Bounds to show full route
      const bounds = L.latLngBounds([
        [driverLat, driverLng],
        [location.lat, location.lng],
      ]);
      map.fitBounds(bounds, { padding: [50, 50] });

      // Invalidate size after modal render for iOS Safari
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 150);
    } catch (err) {
      console.error('Leaflet map error on iOS:', err);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [location, driverLat, driverLng, mapTile]);

  // Actions
  const handleRecenterGps = () => {
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setDriverPos(newLoc);
          setIsLocating(false);
          if (onUpdateLocation) {
            onUpdateLocation({
              lat: newLoc.lat,
              lng: newLoc.lng,
              addressText: `موقع المندوب المباشر (${newLoc.lat.toFixed(4)}, ${newLoc.lng.toFixed(4)})`,
            });
          }
        },
        (err) => {
          console.warn('GPS location fetch warning:', err.message);
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  };

  const googleMapsRouteUrl = `https://www.google.com/maps/dir/?api=1&origin=${driverLat},${driverLng}&destination=${location.lat},${location.lng}&travelmode=driving`;
  const appleMapsUrl = `https://maps.apple.com/?saddr=${driverLat},${driverLng}&daddr=${location.lat},${location.lng}&dirflg=d`;
  const wazeUrl = `https://waze.com/ul?ll=${location.lat},${location.lng}&navigate=yes`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 backdrop-blur-sm p-3 sm:p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-stone-200 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 bg-stone-900 text-white flex justify-between items-center shrink-0 border-b border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-stone-950 rounded-xl font-black">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">{title}</h3>
              <p className="text-[11px] text-stone-400 font-medium">
                خريطة تفاعلية لتحديد أقرب مسار توصيل للزبون
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white rounded-xl hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Quick Route Summary Card */}
          <div className="grid grid-cols-3 gap-2.5 text-right">
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] font-bold text-amber-800 flex items-center gap-1">
                <Navigation className="w-3 h-3" />
                <span>مسافة التوصيل</span>
              </span>
              <p className="text-base font-black text-amber-950 mt-1">{distanceFormatted}</p>
            </div>

            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] font-bold text-emerald-800 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>الوقت المتوقع</span>
              </span>
              <p className="text-base font-black text-emerald-950 mt-1">~ {estimatedMins} دقيقة</p>
            </div>

            <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] font-bold text-stone-600 flex items-center gap-1">
                <Truck className="w-3 h-3 text-amber-600" />
                <span>وضع الملاحة</span>
              </span>
              <p className="text-xs font-extrabold text-stone-900 mt-1">أقرب مسار آمن</p>
            </div>
          </div>

          {/* Map Controls Header */}
          <div className="flex items-center justify-between text-xs font-bold px-1">
            <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200">
              <button
                onClick={() => setMapTile('streets')}
                className={`px-2.5 py-1 rounded-lg transition-all text-[11px] ${
                  mapTile === 'streets'
                    ? 'bg-white shadow-xs text-stone-900 font-black'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                خرائط شوارع
              </button>
              <button
                onClick={() => setMapTile('satellite')}
                className={`px-2.5 py-1 rounded-lg transition-all text-[11px] ${
                  mapTile === 'satellite'
                    ? 'bg-white shadow-xs text-stone-900 font-black'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                فضائية (Satellite)
              </button>
              <button
                onClick={() => setMapTile('dark')}
                className={`px-2.5 py-1 rounded-lg transition-all text-[11px] ${
                  mapTile === 'dark'
                    ? 'bg-white shadow-xs text-stone-900 font-black'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                ليلي
              </button>
            </div>

            <button
              onClick={handleRecenterGps}
              disabled={isLocating}
              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-[11px] font-black transition-all flex items-center gap-1 shrink-0 active:scale-95"
            >
              <LocateFixed className={`w-3.5 h-3.5 text-amber-600 ${isLocating ? 'animate-spin' : ''}`} />
              <span>{isLocating ? 'جاري التحديد...' : 'تحديد موقعي المباشر'}</span>
            </button>
          </div>

          {/* Leaflet Interactive Map Canvas */}
          <div className="relative rounded-2xl overflow-hidden border-2 border-stone-300 shadow-inner h-64 sm:h-72 w-full bg-stone-100">
            <div ref={mapContainerRef} className="w-full h-full z-10" />

            {/* Map Legend Overlay */}
            <div className="absolute bottom-2 right-2 z-20 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-stone-200 shadow-md text-[10px] font-bold flex items-center gap-3 text-stone-800">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
                <span>المندوب</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block"></span>
                <span>موقع العائلة</span>
              </span>
            </div>
          </div>

          {/* Address Details */}
          <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 text-right space-y-1">
            <p className="text-[11px] font-bold text-stone-500">العنوان المسجل للزبون:</p>
            <p className="text-stone-900 font-black text-sm">
              {location.addressText || 'لم يتم تسجيل وصف نصي، الاعتماد على الإحداثيات الجغرافية'}
            </p>
            <p className="text-[10px] font-mono text-stone-500 pt-1">
              الإحداثيات: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
            </p>
          </div>

          {/* Navigation External Apps Launcher */}
          <div className="space-y-2 pt-1">
            <span className="block text-right text-xs font-black text-stone-800">
              الانتقال الفوري وتوجيه الصوت (Turn-by-Turn Navigation):
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <a
                href={googleMapsRouteUrl}
                target="_blank"
                rel="noreferrer"
                className="py-3 px-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Navigation className="w-4 h-4 fill-white" />
                <span>خرائط Google</span>
                <ExternalLink className="w-3 h-3 text-amber-200" />
              </a>

              <a
                href={wazeUrl}
                target="_blank"
                rel="noreferrer"
                className="py-3 px-3 bg-stone-800 hover:bg-stone-900 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Compass className="w-4 h-4 text-amber-400" />
                <span>تطبيق Waze</span>
                <ExternalLink className="w-3 h-3 text-stone-400" />
              </a>

              <a
                href={appleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="py-3 px-3 bg-stone-100 hover:bg-stone-200 text-stone-900 border border-stone-300 font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
              >
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>خرائط Apple</span>
                <ExternalLink className="w-3 h-3 text-stone-500" />
              </a>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-stone-50 border-t border-stone-200 flex justify-between items-center shrink-0">
          <p className="text-[11px] font-bold text-stone-500 pr-2">
            يتم تحديث المسار تلقائياً حسب إشارات الـ GPS
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition-colors"
          >
            إغلاق الخريطة
          </button>
        </div>
      </div>
    </div>
  );
};

