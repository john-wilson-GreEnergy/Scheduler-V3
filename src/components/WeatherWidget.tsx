import React, { useState, useEffect } from 'react';
import { Cloud, Sun, CloudRain, CloudLightning, Wind, Thermometer, Droplets } from 'lucide-react';

interface WeatherData {
  temperature: number;
  windspeed: number;
  weathercode: number;
  time: string;
}

interface WeatherWidgetProps {
  lat: number;
  lng: number;
  locationName: string;
}

const getWeatherIcon = (code: number) => {
  if (code === 0) return <Sun className="text-amber-400" size={24} />;
  if (code >= 1 && code <= 3) return <Cloud className="text-gray-400" size={24} />;
  if (code >= 51 && code <= 67) return <CloudRain className="text-blue-400" size={24} />;
  if (code >= 71 && code <= 77) return <Cloud className="text-white" size={24} />;
  if (code >= 80 && code <= 82) return <CloudRain className="text-blue-500" size={24} />;
  if (code >= 95) return <CloudLightning className="text-purple-400" size={24} />;
  return <Cloud className="text-gray-400" size={24} />;
};

const getWeatherDescription = (code: number) => {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Cloudy';
};

export default function WeatherWidget({ lat, lng, locationName }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&temperature_unit=fahrenheit&windspeed_unit=mph`
        );
        if (!response.ok) throw new Error('Weather data unavailable');
        const data = await response.json();
        setWeather(data.current_weather);
      } catch (err) {
        setError('Failed to load weather');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [lat, lng]);

  if (loading) return (
    <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-6 animate-pulse">
      <div className="h-4 w-24 bg-white/5 rounded mb-4"></div>
      <div className="h-8 w-16 bg-white/5 rounded"></div>
    </div>
  );

  if (error || !weather) return null;

  return (
    <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-6 hover:border-emerald-500/20 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Local Weather</p>
          <p className="text-xs text-gray-400 mt-0.5">{locationName}</p>
        </div>
        <div className="p-2 bg-emerald-500/5 rounded-xl text-emerald-500">
          {getWeatherIcon(weather.weathercode)}
        </div>
      </div>

      <div className="flex items-end gap-3">
        <p className="text-3xl font-bold text-white">{Math.round(weather.temperature)}°F</p>
        <div className="pb-1">
          <p className="text-xs font-bold text-emerald-500">{getWeatherDescription(weather.weathercode)}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
        <div className="flex items-center gap-2">
          <Wind size={14} className="text-gray-500" />
          <div>
            <p className="text-[8px] text-gray-600 uppercase font-bold">Wind</p>
            <p className="text-xs text-gray-300">{weather.windspeed} mph</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Thermometer size={14} className="text-gray-500" />
          <div>
            <p className="text-[8px] text-gray-600 uppercase font-bold">Condition</p>
            <p className="text-xs text-gray-300">Operational</p>
          </div>
        </div>
      </div>
    </div>
  );
}
