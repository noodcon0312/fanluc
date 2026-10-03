/**
 * WeatherCard Export Utilities
 * Allows the user to export, download, and copy the WeatherCard component and standalone HTML
 * so they can easily edit styles, SVG illustrations, layout, and send it back.
 */

export const WEATHER_CARD_TSX_TEMPLATE = `// WeatherCard.tsx - Flat Illustration Weather Card Component
import React, { useState } from "react";
import { 
  SunnyBackground, 
  CloudyBackground, 
  WindyBackground, 
  FogBackground, 
  SnowBackground, 
  RainyBackground, 
  StormBackground 
} from "./WeatherBackgrounds";

export interface WeatherCardData {
  temperature: number;
  condition: string;
  location: string;
  time?: string;
  date?: string;
  error?: string;
}

export const WeatherCard: React.FC<{ data: WeatherCardData; className?: string }> = ({ data, className = "" }) => {
  const getBackground = (condition: string) => {
    switch (condition.toLowerCase()) {
      case "sunny":
      case "clear":
        return SunnyBackground;
      case "cloudy":
        return CloudyBackground;
      case "windy":
        return WindyBackground;
      case "fog":
      case "foggy":
        return FogBackground;
      case "snow":
      case "snowy":
        return SnowBackground;
      case "rainy":
      case "rain":
        return RainyBackground;
      case "stormy":
      case "storm":
        return StormBackground;
      default:
        return CloudyBackground;
    }
  };

  const Background = getBackground(data.condition);

  return (
    <div className={\`card relative group my-2 w-[300px] sm:w-[310px] bg-white rounded-[18px] overflow-hidden shadow-[0_12px_28px_rgba(30,40,60,0.10)] font-sans \${className}\`}>
      {/* Top Section */}
      <div className="card-top relative h-[148px] overflow-hidden">
        {/* SVG Illustration Background */}
        <Background />

        {/* Content Info Overlay */}
        <div className="card-info absolute top-4 left-[18px] text-white select-none drop-shadow-[0_1px_6px_rgba(0,0,0,0.08)] z-10 pointer-events-none">
          <div className="temp flex items-baseline gap-[7px] text-[32px] font-bold leading-none">
            <span>{Math.round(data.temperature)}</span>
            <span className="deg text-[32px] font-bold">°</span>
          </div>
          <div className="cond text-[13.5px] font-normal opacity-90 mt-[2px]">{data.condition}</div>
          <div className="loc text-[12.5px] font-normal opacity-85 mt-[3px]">{data.location}</div>
        </div>
      </div>
      
      {/* Bottom Section */}
      <div className="card-bottom flex justify-between items-center px-[18px] py-[13px] bg-white border-t border-black/5">
        <div className="time text-[15px] font-semibold text-black">{data.time || "09:30"}</div>
        <div className="date text-[12.5px] text-black/60">{data.date || "Mon.Mar 26"}</div>
      </div>
    </div>
  );
};

export default WeatherCard;
`;

export const WEATHER_CARD_STANDALONE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Weather Cards</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 48px 20px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 22px;
    max-width: 640px;
    margin: 0 auto;
  }

  @media (max-width: 520px) {
    .grid { grid-template-columns: 1fr; }
  }

  .card {
    background: #ffffff;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 12px 28px rgba(30, 40, 60, 0.10);
  }

  .card-top {
    position: relative;
    height: 148px;
  }

  .card-top svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .card-info {
    position: absolute;
    top: 16px;
    left: 18px;
    color: #ffffff;
    text-shadow: 0 1px 6px rgba(0,0,0,0.08);
  }

  .temp {
    font-size: 32px;
    font-weight: 700;
    line-height: 1;
    display: flex;
    align-items: baseline;
    gap: 7px;
  }

  .temp .deg { font-size: 32px; font-weight: 700; }

  .cond {
    font-size: 13.5px;
    font-weight: 400;
    opacity: 0.92;
  }

  .loc {
    font-size: 12.5px;
    font-weight: 400;
    opacity: 0.85;
    margin-top: 3px;
  }

  .card-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 13px 18px;
  }

  .time {
    font-size: 15px;
    font-weight: 600;
    color: #000000;
  }

  .date {
    font-size: 12.5px;
    color: #000000;
  }

  /* ---- animations ---- */
  @keyframes pulseGlow {
    0%, 100% { opacity: 0.9; transform: scale(1); }
    50%      { opacity: 0.55; transform: scale(1.1); }
  }
  @keyframes softGlow {
    0%, 100% { opacity: 0.9; }
    50%      { opacity: 0.55; }
  }
  @keyframes swayTree {
    0%, 100% { transform: rotate(-2.5deg); }
    50%      { transform: rotate(2.5deg); }
  }
  @keyframes spinBlades {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes driftFog {
    0%, 100% { transform: translateX(-14px); }
    50%      { transform: translateX(14px); }
  }
  @keyframes driftCloud {
    0%   { transform: translateX(0); }
    100% { transform: translateX(18px); }
  }
  @keyframes flyBird {
    0%   { transform: translateX(-30px); opacity: 0; }
    10%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { transform: translateX(320px); opacity: 0; }
  }
  @keyframes fallSnow {
    0%   { transform: translateY(-10px); opacity: 0; }
    10%  { opacity: 0.9; }
    100% { transform: translateY(150px); opacity: 0; }
  }
  @keyframes twinkle {
    0%, 100% { opacity: 0.9; }
    50%      { opacity: 0.15; }
  }
  @keyframes flicker {
    0%, 100% { opacity: 1; }
    45%      { opacity: 0.7; }
    55%      { opacity: 1; }
    75%      { opacity: 0.8; }
  }
  @keyframes bobBoat {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-3px); }
  }
  @keyframes fallRain {
    0%   { transform: translateY(-25px); opacity: 0; }
    20%  { opacity: 0.85; }
    100% { transform: translateY(45px); opacity: 0; }
  }

  .sun-glow  { transform-box: fill-box; transform-origin: center; animation: pulseGlow 4s ease-in-out infinite; }
  .moon-glow { transform-box: fill-box; transform-origin: center; animation: softGlow 5s ease-in-out infinite; }
  .tree-sway { transform-box: fill-box; transform-origin: bottom center; animation: swayTree 4s ease-in-out infinite; }
  .blades    { transform-box: fill-box; transform-origin: center; animation: spinBlades 6s linear infinite; }
  .fog-band  { animation: driftFog 8s ease-in-out infinite; }
  .cloud     { animation: driftCloud 10s ease-in-out infinite alternate; }
  .bird      { animation: flyBird 9s linear infinite; }
  .snowflake { animation: fallSnow linear infinite; }
  .star      { transform-box: fill-box; transform-origin: center; animation: twinkle 3s ease-in-out infinite; }
  .window-light { animation: flicker 5s ease-in-out infinite; }
  .boat      { transform-box: fill-box; transform-origin: center; animation: bobBoat 3.5s ease-in-out infinite; }
  .lantern-glow { transform-box: fill-box; transform-origin: center; animation: pulseGlow 2.2s ease-in-out infinite; }
  .raindrop  { animation: fallRain linear infinite; }

  @media (prefers-reduced-motion: reduce) {
    .sun-glow, .moon-glow, .tree-sway, .blades, .fog-band, .cloud, .bird,
    .snowflake, .star, .window-light, .boat, .lantern-glow, .raindrop {
      animation: none !important;
    }
  }
</style>
</head>
<body>

<div class="grid">

  <!-- 1. SUNNY -->
  <div class="card">
    <div class="card-top">
      <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#000000"/>
          </linearGradient>
        </defs>
        <rect width="300" height="150" fill="url(#g1)"/>
        <circle cx="252" cy="34" r="30" fill="#ffffff" opacity="0.25" class="sun-glow"/>
        <circle cx="252" cy="34" r="19" fill="#ffffff" opacity="0.95" class="sun-glow" style="animation-delay:-1s;"/>
        <path d="M0,112 L55,75 L95,102 L150,66 L205,98 L255,78 L300,108 L300,150 L0,150 Z" fill="#ffffff" opacity="0.55"/>
        <path d="M0,132 L50,100 L90,122 L145,92 L195,118 L245,102 L300,128 L300,150 L0,150 Z" fill="#000000" opacity="0.7"/>
        <polygon points="185,140 213,98 241,140" fill="#000000"/>
        <polygon points="213,98 224,140 202,140" fill="#000000" opacity="0.65"/>
        <polygon points="213,115 220,140 206,140" fill="#000000"/>
      </svg>
      <div class="card-info">
        <div class="temp"><span>23</span><span class="deg">°</span></div>
        <div class="cond">Sunny</div>
        <div class="loc">Beijing</div>
      </div>
    </div>
    <div class="card-bottom">
      <div class="time">09:30</div>
      <div class="date">Mon.Mar 26</div>
    </div>
  </div>

  <!-- 2. CLOUDY -->
  <div class="card">
    <div class="card-top">
      <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#ffffff"/>
          </linearGradient>
        </defs>
        <rect width="300" height="150" fill="url(#g2)"/>
        <path d="M0,118 L65,82 L120,108 L175,78 L230,106 L300,88 L300,150 L0,150 Z" fill="#ffffff" opacity="0.6"/>
        <ellipse cx="65" cy="42" rx="26" ry="10" fill="#ffffff" opacity="0.5" class="cloud"/>
        <ellipse cx="112" cy="58" rx="18" ry="7" fill="#ffffff" opacity="0.4" class="cloud" style="animation-duration:13s; animation-delay:-4s;"/>
        <circle cx="245" cy="38" r="19" fill="#ffffff" opacity="0.9" class="moon-glow"/>
        <polygon points="256,150 268,72 280,150" fill="#000000" opacity="0.85" class="tree-sway" style="animation-delay:-1s;"/>
        <polygon points="270,150 282,55 294,150" fill="#000000" opacity="0.9" class="tree-sway" style="animation-delay:-2.4s;"/>
        <polygon points="282,150 294,90 306,150" fill="#000000" opacity="0.9" class="tree-sway" style="animation-delay:-0.6s;"/>
      </svg>
      <div class="card-info">
        <div class="temp"><span>18</span><span class="deg">°</span></div>
        <div class="cond">Cloudy</div>
        <div class="loc">Beijing</div>
      </div>
    </div>
    <div class="card-bottom">
      <div class="time">14:10</div>
      <div class="date">Mon.Mar 26</div>
    </div>
  </div>

  <!-- 3. WINDY -->
  <div class="card">
    <div class="card-top">
      <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="g3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#000000"/>
          </linearGradient>
        </defs>
        <rect width="300" height="150" fill="url(#g3)"/>
        <path d="M0,150 C50,112 110,138 170,112 C225,90 270,118 300,102 L300,150 Z" fill="#ffffff" opacity="0.65"/>
        <polygon points="35,150 46,120 57,150" fill="#000000" opacity="0.8" class="tree-sway"/>
        <polygon points="55,150 66,128 77,150" fill="#000000" opacity="0.7" class="tree-sway" style="animation-delay:-1.6s;"/>
        <g transform="translate(255,52)">
          <rect x="-4" y="0" width="8" height="88" fill="#ffffff"/>
          <polygon points="-9,0 9,0 0,-16" fill="#ffffff"/>
          <g stroke="#ffffff" stroke-width="4" stroke-linecap="round" class="blades">
            <line x1="0" y1="0" x2="0" y2="-27" transform="rotate(10)"/>
            <line x1="0" y1="0" x2="0" y2="-27" transform="rotate(100)"/>
            <line x1="0" y1="0" x2="0" y2="-27" transform="rotate(190)"/>
            <line x1="0" y1="0" x2="0" y2="-27" transform="rotate(280)"/>
          </g>
          <circle r="3.5" fill="#000000"/>
        </g>
      </svg>
      <div class="card-info">
        <div class="temp"><span>14</span><span class="deg">°</span></div>
        <div class="cond">Windy</div>
        <div class="loc">Beijing</div>
      </div>
    </div>
    <div class="card-bottom">
      <div class="time">16:15</div>
      <div class="date">Mon.Mar 26</div>
    </div>
  </div>

  <!-- 4. FOG -->
  <div class="card">
    <div class="card-top">
      <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="g4" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#000000"/>
          </linearGradient>
          <filter id="mistBlur" x="-30%" y="-100%" width="160%" height="300%">
            <feGaussianBlur stdDeviation="5"/>
          </filter>
        </defs>
        <rect width="300" height="150" fill="url(#g4)"/>
        <circle cx="228" cy="36" r="18" fill="#ffffff" opacity="0.9" class="sun-glow"/>
        <path d="M40,58 C46,52 52,52 58,58 C64,52 70,52 76,58" fill="none" stroke="#000000" stroke-width="1.6" stroke-linecap="round" opacity="0.75" class="bird" style="animation-duration:9s;"/>
        <path d="M65,70 C69,66 73,66 77,70 C81,66 85,66 89,70" fill="none" stroke="#000000" stroke-width="1.3" stroke-linecap="round" opacity="0.6" class="bird" style="animation-duration:11s; animation-delay:-5s;"/>
        <polygon points="252,150 296,150 286,122 262,122" fill="#000000"/>
        <rect x="266" y="62" width="16" height="62" fill="#ffffff"/>
        <rect x="266" y="86" width="16" height="11" fill="#000000" opacity="0.9"/>
        <polygon points="262,62 286,62 274,46" fill="#000000"/>
        <rect x="269" y="53" width="10" height="9" fill="#ffffff" class="window-light"/>
        <g filter="url(#mistBlur)">
          <ellipse cx="150" cy="100" rx="170" ry="9" fill="#ffffff" opacity="0.5" class="fog-band" style="animation-duration:8s;"/>
          <ellipse cx="160" cy="118" rx="190" ry="11" fill="#ffffff" opacity="0.6" class="fog-band" style="animation-duration:10s; animation-delay:-3s;"/>
          <ellipse cx="140" cy="136" rx="200" ry="13" fill="#ffffff" opacity="0.7" class="fog-band" style="animation-duration:12s; animation-delay:-6s;"/>
        </g>
      </svg>
      <div class="card-info">
        <div class="temp"><span>20</span><span class="deg">°</span></div>
        <div class="cond">Fog</div>
        <div class="loc">Beijing</div>
      </div>
    </div>
    <div class="card-bottom">
      <div class="time">10:20</div>
      <div class="date">Mon.Mar 26</div>
    </div>
  </div>

  <!-- 5. SNOW -->
  <div class="card">
    <div class="card-top">
      <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="g5" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#000000"/>
            <stop offset="100%" stop-color="#000000"/>
          </linearGradient>
        </defs>
        <rect width="300" height="150" fill="url(#g5)"/>
        <circle cx="40" cy="24" r="1.6" fill="#ffffff" opacity="0.9" class="star"/>
        <circle cx="90" cy="16" r="1.3" fill="#ffffff" opacity="0.8" class="star" style="animation-delay:-1s;"/>
        <circle cx="130" cy="30" r="1.4" fill="#ffffff" opacity="0.7" class="star" style="animation-delay:-2s;"/>
        <circle cx="260" cy="20" r="1.5" fill="#ffffff" opacity="0.85" class="star" style="animation-delay:-0.5s;"/>
        <circle cx="20" cy="46" r="1.2" fill="#ffffff" opacity="0.7" class="star" style="animation-delay:-1.5s;"/>
        <path d="M0,150 L0,122 Q80,98 155,116 Q230,132 300,108 L300,150 Z" fill="#ffffff" opacity="0.95"/>
        <polygon points="40,150 50,124 60,150" fill="#000000"/>
        <polygon points="50,124 60,150 40,150" fill="#000000"/>
        <circle cx="50" cy="120" r="4" fill="#ffffff" opacity="0.85"/>

        <!-- snowman -->
        <ellipse cx="101" cy="134" rx="13" ry="4" fill="#000000" opacity="0.35"/>
        <circle cx="100" cy="128" r="12" fill="#ffffff"/>
        <circle cx="100" cy="110" r="9" fill="#ffffff"/>
        <circle cx="100" cy="95" r="6.5" fill="#ffffff"/>
        <line x1="91" y1="108" x2="78" y2="98" stroke="#000000" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="109" y1="108" x2="121" y2="100" stroke="#000000" stroke-width="1.6" stroke-linecap="round"/>
        <rect x="93" y="101" width="14" height="3.5" rx="1.5" fill="#000000"/>
        <circle cx="97.5" cy="94" r="0.9" fill="#000000"/>
        <circle cx="102.5" cy="94" r="0.9" fill="#000000"/>
        <polygon points="100,96 107,97.3 100,99" fill="#000000"/>
        <circle cx="100" cy="106" r="0.9" fill="#000000"/>
        <circle cx="100" cy="111" r="0.9" fill="#000000"/>
        <circle cx="100" cy="116" r="0.9" fill="#000000"/>
        <polygon points="92,89 108,89 105,80 95,80" fill="#000000"/>
        <rect x="91" y="88" width="18" height="2.5" rx="1" fill="#000000"/>

        <!-- gift boxes -->
        <rect x="221" y="127" width="17" height="15" rx="1.5" fill="#000000"/>
        <rect x="227" y="127" width="5" height="15" fill="#ffffff"/>
        <rect x="221" y="132" width="17" height="4.5" fill="#ffffff"/>
        <circle cx="229.5" cy="125" r="2.3" fill="#ffffff"/>
        <rect x="240" y="133" width="13" height="11" rx="1.5" fill="#000000"/>
        <rect x="244.5" y="133" width="4" height="11" fill="#ffffff"/>
        <rect x="240" y="137" width="13" height="3.5" fill="#ffffff"/>
        <rect x="153" y="97" width="56" height="43" fill="#000000"/>
        <polygon points="148,97 214,97 181,68" fill="#000000"/>
        <rect x="192" y="72" width="8" height="17" fill="#000000"/>
        <rect x="163" y="110" width="11" height="11" fill="#ffffff" class="window-light"/>
        <rect x="188" y="110" width="11" height="11" fill="#ffffff" class="window-light" style="animation-delay:-2.5s;"/>
        <rect x="175" y="122" width="13" height="18" fill="#000000"/>
        <circle cx="30" cy="10" r="1.6" fill="#ffffff" class="snowflake" style="animation-duration:6s;"/>
        <circle cx="80" cy="0" r="1.3" fill="#ffffff" class="snowflake" style="animation-duration:7.5s; animation-delay:-2s;"/>
        <circle cx="140" cy="10" r="1.5" fill="#ffffff" class="snowflake" style="animation-duration:5.5s; animation-delay:-1s;"/>
        <circle cx="220" cy="0" r="1.4" fill="#ffffff" class="snowflake" style="animation-duration:8s; animation-delay:-4s;"/>
        <circle cx="270" cy="10" r="1.6" fill="#ffffff" class="snowflake" style="animation-duration:6.5s; animation-delay:-3s;"/>
        <circle cx="110" cy="0" r="1.2" fill="#ffffff" class="snowflake" style="animation-duration:7s; animation-delay:-5s;"/>
        <circle cx="290" cy="10" r="1.3" fill="#ffffff" class="snowflake" style="animation-duration:9s; animation-delay:-6s;"/>
      </svg>
      <div class="card-info">
        <div class="temp"><span>-3</span><span class="deg">°</span></div>
        <div class="cond">Snow</div>
        <div class="loc">Beijing</div>
      </div>
    </div>
    <div class="card-bottom">
      <div class="time">11:30</div>
      <div class="date">Fri.Dec 15</div>
    </div>
  </div>

  <!-- 6. RAINY -->
  <div class="card">
    <div class="card-top">
      <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="g6" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#000000"/>
            <stop offset="100%" stop-color="#000000"/>
          </linearGradient>
        </defs>
        <rect width="300" height="150" fill="url(#g6)"/>
        <path d="M0,100 L80,78 L160,96 L240,74 L300,90 L300,150 L0,150 Z" fill="#000000" opacity="0.55"/>
        <rect x="0" y="112" width="300" height="38" fill="#000000"/>
        <g class="boat">
          <path d="M104,116 Q148,140 192,116 L192,123 Q148,146 104,123 Z" fill="#000000"/>
          <path d="M104,116 Q148,140 192,116" fill="none" stroke="#000000" stroke-width="1.5" opacity="0.8"/>
          <circle cx="130" cy="123" r="3.2" fill="#ffffff" class="lantern-glow"/>
          <circle cx="130" cy="123" r="7" fill="#ffffff" opacity="0.3" class="lantern-glow"/>
          <circle cx="166" cy="123" r="3.2" fill="#ffffff" class="lantern-glow" style="animation-delay:-1.1s;"/>
          <circle cx="166" cy="123" r="7" fill="#ffffff" opacity="0.3" class="lantern-glow" style="animation-delay:-1.1s;"/>
        </g>
        <ellipse cx="132" cy="136" rx="5" ry="1.6" fill="#ffffff" opacity="0.35" class="window-light"/>
        <ellipse cx="165" cy="136" rx="5" ry="1.6" fill="#ffffff" opacity="0.35" class="window-light" style="animation-delay:-2.5s;"/>
        <line x1="40" y1="0" x2="34" y2="20" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.55" class="raindrop" style="animation-duration:1.1s;"/>
        <line x1="90" y1="0" x2="84" y2="20" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.5" class="raindrop" style="animation-duration:0.9s; animation-delay:-0.4s;"/>
        <line x1="220" y1="0" x2="214" y2="20" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.5" class="raindrop" style="animation-duration:1.3s; animation-delay:-0.7s;"/>
        <line x1="260" y1="0" x2="254" y2="20" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.55" class="raindrop" style="animation-duration:1s; animation-delay:-0.2s;"/>
        <line x1="20" y1="0" x2="14" y2="20" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.45" class="raindrop" style="animation-duration:1.2s; animation-delay:-0.9s;"/>
      </svg>
      <div class="card-info">
        <div class="temp"><span>12</span><span class="deg">°</span></div>
        <div class="cond">Rainy</div>
        <div class="loc">Beijing</div>
      </div>
    </div>
    <div class="card-bottom">
      <div class="time">19:40</div>
      <div class="date">Mon.Mar 26</div>
    </div>
  </div>

</div>

</body>
</html>
`;

export function triggerDownload(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportWeatherCardTsx() {
  triggerDownload("WeatherCard.tsx", WEATHER_CARD_TSX_TEMPLATE, "text/typescript;charset=utf-8");
}

export function exportWeatherCardHtml() {
  triggerDownload("weather_card_preview.html", WEATHER_CARD_STANDALONE_HTML, "text/html;charset=utf-8");
}

export async function copyWeatherCardSource(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(WEATHER_CARD_TSX_TEMPLATE);
    return true;
  } catch (err) {
    console.error("Failed to copy source", err);
    return false;
  }
}
