import React from "react";

// 1. SUNNY
export const SunnyBackground: React.FC = () => (
  <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full block">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#000000" />
      </linearGradient>
    </defs>
    <rect width="300" height="150" fill="url(#g1)" />
    <circle cx="252" cy="34" r="30" fill="#ffffff" opacity="0.25" className="sun-glow" />
    <circle cx="252" cy="34" r="19" fill="#ffffff" opacity="0.95" className="sun-glow" style={{ animationDelay: "-1s" }} />
    <path d="M0,112 L55,75 L95,102 L150,66 L205,98 L255,78 L300,108 L300,150 L0,150 Z" fill="#ffffff" opacity="0.55" />
    <path d="M0,132 L50,100 L90,122 L145,92 L195,118 L245,102 L300,128 L300,150 L0,150 Z" fill="#000000" opacity="0.7" />
    <polygon points="185,140 213,98 241,140" fill="#000000" />
    <polygon points="213,98 224,140 202,140" fill="#000000" opacity="0.65" />
    <polygon points="213,115 220,140 206,140" fill="#000000" />
  </svg>
);

// 2. CLOUDY
export const CloudyBackground: React.FC = () => (
  <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full block">
    <defs>
      <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#ffffff" />
      </linearGradient>
    </defs>
    <rect width="300" height="150" fill="url(#g2)" />
    <path d="M0,118 L65,82 L120,108 L175,78 L230,106 L300,88 L300,150 L0,150 Z" fill="#ffffff" opacity="0.6" />
    <ellipse cx="65" cy="42" rx="26" ry="10" fill="#ffffff" opacity="0.5" className="cloud" />
    <ellipse cx="112" cy="58" rx="18" ry="7" fill="#ffffff" opacity="0.4" className="cloud" style={{ animationDuration: "13s", animationDelay: "-4s" }} />
    <circle cx="245" cy="38" r="19" fill="#ffffff" opacity="0.9" className="moon-glow" />
    <polygon points="256,150 268,72 280,150" fill="#000000" opacity="0.85" className="tree-sway" style={{ animationDelay: "-1s" }} />
    <polygon points="270,150 282,55 294,150" fill="#000000" opacity="0.9" className="tree-sway" style={{ animationDelay: "-2.4s" }} />
    <polygon points="282,150 294,90 306,150" fill="#000000" opacity="0.9" className="tree-sway" style={{ animationDelay: "-0.6s" }} />
  </svg>
);

// 3. WINDY
export const WindyBackground: React.FC = () => (
  <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full block">
    <defs>
      <linearGradient id="g3" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#000000" />
      </linearGradient>
    </defs>
    <rect width="300" height="150" fill="url(#g3)" />
    <path d="M0,150 C50,112 110,138 170,112 C225,90 270,118 300,102 L300,150 Z" fill="#ffffff" opacity="0.65" />
    <polygon points="35,150 46,120 57,150" fill="#000000" opacity="0.8" className="tree-sway" />
    <polygon points="55,150 66,128 77,150" fill="#000000" opacity="0.7" className="tree-sway" style={{ animationDelay: "-1.6s" }} />
    <g transform="translate(255,52)">
      <rect x="-4" y="0" width="8" height="88" fill="#ffffff" />
      <polygon points="-9,0 9,0 0,-16" fill="#ffffff" />
      <g stroke="#ffffff" strokeWidth="4" strokeLinecap="round" className="blades">
        <line x1="0" y1="0" x2="0" y2="-27" transform="rotate(10)" />
        <line x1="0" y1="0" x2="0" y2="-27" transform="rotate(100)" />
        <line x1="0" y1="0" x2="0" y2="-27" transform="rotate(190)" />
        <line x1="0" y1="0" x2="0" y2="-27" transform="rotate(280)" />
      </g>
      <circle r="3.5" fill="#000000" />
    </g>
  </svg>
);

// 4. FOG
export const FogBackground: React.FC = () => (
  <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full block">
    <defs>
      <linearGradient id="g4" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#000000" />
      </linearGradient>
      <filter id="mistBlur" x="-30%" y="-100%" width="160%" height="300%">
        <feGaussianBlur stdDeviation="5" />
      </filter>
    </defs>
    <rect width="300" height="150" fill="url(#g4)" />
    <circle cx="228" cy="36" r="18" fill="#ffffff" opacity="0.9" className="sun-glow" />
    <path d="M40,58 C46,52 52,52 58,58 C64,52 70,52 76,58" fill="none" stroke="#000000" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" className="bird" style={{ animationDuration: "9s" }} />
    <path d="M65,70 C69,66 73,66 77,70 C81,66 85,66 89,70" fill="none" stroke="#000000" strokeWidth="1.3" strokeLinecap="round" opacity="0.6" className="bird" style={{ animationDuration: "11s", animationDelay: "-5s" }} />
    <polygon points="252,150 296,150 286,122 262,122" fill="#000000" />
    <rect x="266" y="62" width="16" height="62" fill="#ffffff" />
    <rect x="266" y="86" width="16" height="11" fill="#000000" opacity="0.9" />
    <polygon points="262,62 286,62 274,46" fill="#000000" />
    <rect x="269" y="53" width="10" height="9" fill="#ffffff" className="window-light" />
    <g filter="url(#mistBlur)">
      <ellipse cx="150" cy="100" rx="170" ry="9" fill="#ffffff" opacity="0.5" className="fog-band" style={{ animationDuration: "8s" }} />
      <ellipse cx="160" cy="118" rx="190" ry="11" fill="#ffffff" opacity="0.6" className="fog-band" style={{ animationDuration: "10s", animationDelay: "-3s" }} />
      <ellipse cx="140" cy="136" rx="200" ry="13" fill="#ffffff" opacity="0.7" className="fog-band" style={{ animationDuration: "12s", animationDelay: "-6s" }} />
    </g>
  </svg>
);

// 5. SNOW
export const SnowBackground: React.FC = () => (
  <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full block">
    <defs>
      <linearGradient id="g5" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#000000" />
        <stop offset="100%" stopColor="#000000" />
      </linearGradient>
    </defs>
    <rect width="300" height="150" fill="url(#g5)" />
    <circle cx="40" cy="24" r="1.6" fill="#ffffff" opacity="0.9" className="star" />
    <circle cx="90" cy="16" r="1.3" fill="#ffffff" opacity="0.8" className="star" style={{ animationDelay: "-1s" }} />
    <circle cx="130" cy="30" r="1.4" fill="#ffffff" opacity="0.7" className="star" style={{ animationDelay: "-2s" }} />
    <circle cx="260" cy="20" r="1.5" fill="#ffffff" opacity="0.85" className="star" style={{ animationDelay: "-0.5s" }} />
    <circle cx="20" cy="46" r="1.2" fill="#ffffff" opacity="0.7" className="star" style={{ animationDelay: "-1.5s" }} />
    <path d="M0,150 L0,122 Q80,98 155,116 Q230,132 300,108 L300,150 Z" fill="#ffffff" opacity="0.95" />
    <polygon points="40,150 50,124 60,150" fill="#000000" />
    <polygon points="50,124 60,150 40,150" fill="#000000" />
    <circle cx="50" cy="120" r="4" fill="#ffffff" opacity="0.85" />

    {/* snowman */}
    <ellipse cx="101" cy="134" rx="13" ry="4" fill="#000000" opacity="0.35" />
    <circle cx="100" cy="128" r="12" fill="#ffffff" />
    <circle cx="100" cy="110" r="9" fill="#ffffff" />
    <circle cx="100" cy="95" r="6.5" fill="#ffffff" />
    <line x1="91" y1="108" x2="78" y2="98" stroke="#000000" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="109" y1="108" x2="121" y2="100" stroke="#000000" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="93" y="101" width="14" height="3.5" rx="1.5" fill="#000000" />
    <circle cx="97.5" cy="94" r="0.9" fill="#000000" />
    <circle cx="102.5" cy="94" r="0.9" fill="#000000" />
    <polygon points="100,96 107,97.3 100,99" fill="#000000" />
    <circle cx="100" cy="106" r="0.9" fill="#000000" />
    <circle cx="100" cy="111" r="0.9" fill="#000000" />
    <circle cx="100" cy="116" r="0.9" fill="#000000" />
    <polygon points="92,89 108,89 105,80 95,80" fill="#000000" />
    <rect x="91" y="88" width="18" height="2.5" rx="1" fill="#000000" />

    {/* gift boxes */}
    <rect x="221" y="127" width="17" height="15" rx="1.5" fill="#000000" />
    <rect x="227" y="127" width="5" height="15" fill="#ffffff" />
    <rect x="221" y="132" width="17" height="4.5" fill="#ffffff" />
    <circle cx="229.5" cy="125" r="2.3" fill="#ffffff" />
    <rect x="240" y="133" width="13" height="11" rx="1.5" fill="#000000" />
    <rect x="244.5" y="133" width="4" height="11" fill="#ffffff" />
    <rect x="240" y="137" width="13" height="3.5" fill="#ffffff" />
    <rect x="153" y="97" width="56" height="43" fill="#000000" />
    <polygon points="148,97 214,97 181,68" fill="#000000" />
    <rect x="192" y="72" width="8" height="17" fill="#000000" />
    <rect x="163" y="110" width="11" height="11" fill="#ffffff" className="window-light" />
    <rect x="188" y="110" width="11" height="11" fill="#ffffff" className="window-light" style={{ animationDelay: "-2.5s" }} />
    <rect x="175" y="122" width="13" height="18" fill="#000000" />
    <circle cx="30" cy="10" r="1.6" fill="#ffffff" className="snowflake" style={{ animationDuration: "6s" }} />
    <circle cx="80" cy="0" r="1.3" fill="#ffffff" className="snowflake" style={{ animationDuration: "7.5s", animationDelay: "-2s" }} />
    <circle cx="140" cy="10" r="1.5" fill="#ffffff" className="snowflake" style={{ animationDuration: "5.5s", animationDelay: "-1s" }} />
    <circle cx="220" cy="0" r="1.4" fill="#ffffff" className="snowflake" style={{ animationDuration: "8s", animationDelay: "-4s" }} />
    <circle cx="270" cy="10" r="1.6" fill="#ffffff" className="snowflake" style={{ animationDuration: "6.5s", animationDelay: "-3s" }} />
    <circle cx="110" cy="0" r="1.2" fill="#ffffff" className="snowflake" style={{ animationDuration: "7s", animationDelay: "-5s" }} />
    <circle cx="290" cy="10" r="1.3" fill="#ffffff" className="snowflake" style={{ animationDuration: "9s", animationDelay: "-6s" }} />
  </svg>
);

// 6. RAINY
export const RainyBackground: React.FC = () => (
  <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full block">
    <defs>
      <linearGradient id="g6" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#000000" />
        <stop offset="100%" stopColor="#000000" />
      </linearGradient>
    </defs>
    <rect width="300" height="150" fill="url(#g6)" />
    <path d="M0,100 L80,78 L160,96 L240,74 L300,90 L300,150 L0,150 Z" fill="#000000" opacity="0.55" />
    <rect x="0" y="112" width="300" height="38" fill="#000000" />
    <g className="boat">
      <path d="M104,116 Q148,140 192,116 L192,123 Q148,146 104,123 Z" fill="#000000" />
      <path d="M104,116 Q148,140 192,116" fill="none" stroke="#000000" strokeWidth="1.5" opacity="0.8" />
      <circle cx="130" cy="123" r="3.2" fill="#ffffff" className="lantern-glow" />
      <circle cx="130" cy="123" r="7" fill="#ffffff" opacity="0.3" className="lantern-glow" />
      <circle cx="166" cy="123" r="3.2" fill="#ffffff" className="lantern-glow" style={{ animationDelay: "-1.1s" }} />
      <circle cx="166" cy="123" r="7" fill="#ffffff" opacity="0.3" className="lantern-glow" style={{ animationDelay: "-1.1s" }} />
    </g>
    <ellipse cx="132" cy="136" rx="5" ry="1.6" fill="#ffffff" opacity="0.35" className="window-light" />
    <ellipse cx="165" cy="136" rx="5" ry="1.6" fill="#ffffff" opacity="0.35" className="window-light" style={{ animationDelay: "-2.5s" }} />
    <line x1="40" y1="0" x2="34" y2="20" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" className="raindrop" style={{ animationDuration: "1.1s" }} />
    <line x1="90" y1="0" x2="84" y2="20" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" className="raindrop" style={{ animationDuration: "0.9s", animationDelay: "-0.4s" }} />
    <line x1="220" y1="0" x2="214" y2="20" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" className="raindrop" style={{ animationDuration: "1.3s", animationDelay: "-0.7s" }} />
    <line x1="260" y1="0" x2="254" y2="20" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" className="raindrop" style={{ animationDuration: "1s", animationDelay: "-0.2s" }} />
    <line x1="20" y1="0" x2="14" y2="20" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.45" className="raindrop" style={{ animationDuration: "1.2s", animationDelay: "-0.9s" }} />
  </svg>
);

// 7. STORMY (With thunder and animated lightning bolts)
export const StormBackground: React.FC = () => (
  <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full block">
    <defs>
      <linearGradient id="g7" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#000000" />
        <stop offset="100%" stopColor="#000000" />
      </linearGradient>
      <filter id="boltGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <rect width="300" height="150" fill="url(#g7)" />

    {/* Sky flash on lightning strike */}
    <rect width="300" height="150" fill="#ffffff" opacity="0" className="lightning-sky" />

    {/* Distant stormy hills */}
    <path d="M0,105 L70,80 L140,98 L210,75 L300,92 L300,150 L0,150 Z" fill="#000000" opacity="0.6" />
    <rect x="0" y="115" width="300" height="35" fill="#000000" />

    {/* Dark storm clouds */}
    <ellipse cx="60" cy="28" rx="48" ry="16" fill="#000000" opacity="0.9" className="cloud" />
    <ellipse cx="145" cy="20" rx="58" ry="18" fill="#000000" opacity="0.95" className="cloud" style={{ animationDelay: "-3s" }} />
    <ellipse cx="235" cy="26" rx="52" ry="16" fill="#000000" opacity="0.9" className="cloud" style={{ animationDelay: "-6s" }} />

    {/* Primary lightning bolt (Thunder / Lightning) */}
    <g className="lightning-bolt" filter="url(#boltGlow)">
      <polygon
        points="148,22 136,58 144,58 128,100 133,100 123,118 142,72 134,72 152,22"
        fill="#ffffff"
      />
      <polygon
        points="136,58 124,74 127,74 116,94 120,94 114,102 123,80 120,80 136,58"
        fill="#ffffff"
        opacity="0.85"
      />
    </g>

    {/* Secondary distant lightning bolt */}
    <g className="lightning-bolt" filter="url(#boltGlow)" style={{ animationDelay: "-2.2s" }}>
      <polygon
        points="225,28 216,54 222,54 210,84 214,84 208,94 220,64 215,64 228,28"
        fill="#ffffff"
      />
    </g>

    {/* Heavy rain drops */}
    <line x1="30" y1="0" x2="22" y2="24" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" className="raindrop" style={{ animationDuration: "0.8s" }} />
    <line x1="75" y1="0" x2="67" y2="24" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" className="raindrop" style={{ animationDuration: "0.7s", animationDelay: "-0.3s" }} />
    <line x1="120" y1="0" x2="112" y2="24" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" className="raindrop" style={{ animationDuration: "0.9s", animationDelay: "-0.5s" }} />
    <line x1="170" y1="0" x2="162" y2="24" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" className="raindrop" style={{ animationDuration: "0.75s", animationDelay: "-0.2s" }} />
    <line x1="215" y1="0" x2="207" y2="24" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" className="raindrop" style={{ animationDuration: "0.85s", animationDelay: "-0.6s" }} />
    <line x1="260" y1="0" x2="252" y2="24" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" className="raindrop" style={{ animationDuration: "0.7s", animationDelay: "-0.4s" }} />
    <line x1="290" y1="0" x2="282" y2="24" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" className="raindrop" style={{ animationDuration: "0.8s", animationDelay: "-0.1s" }} />
  </svg>
);
