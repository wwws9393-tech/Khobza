// Dynamic Animated SVG Favicon Generator for Khobza App

export function initAnimatedFavicon(): () => void {
  // Disable animation on mobile/iOS to save battery & prevent DOM re-renders
  const isMobile =
    typeof window !== 'undefined' &&
    (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      window.matchMedia('(max-width: 768px)').matches);

  if (isMobile) {
    return () => {};
  }

  let frame = 0;
  let intervalId: any = null;

  const updateFavicon = () => {
    try {
      frame = (frame + 1) % 60;
      const pulseScale = 1 + Math.sin((frame / 60) * Math.PI * 2) * 0.05;
      const steamY = 12 + Math.sin((frame / 30) * Math.PI) * 3;

      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1c1917"/>
            <stop offset="50%" stop-color="#451a03"/>
            <stop offset="100%" stop-color="#1c1917"/>
          </linearGradient>
          <linearGradient id="bread" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fef08a"/>
            <stop offset="50%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#b45309"/>
          </linearGradient>
        </defs>
        <rect width="100" height="100" rx="28" fill="url(#bg)"/>
        <circle cx="50" cy="50" r="42" fill="#f59e0b" opacity="0.2"/>
        
        <!-- Steam -->
        <path d="M 38 ${30 + steamY} Q 42 ${20 + steamY} 40 ${10 + steamY} M 50 ${28 + steamY} Q 54 ${18 + steamY} 52 ${8 + steamY} M 62 ${30 + steamY} Q 66 ${20 + steamY} 64 ${10 + steamY}" 
              stroke="#fef08a" stroke-width="3.5" stroke-linecap="round" fill="none" opacity="0.8"/>

        <!-- Bread Loaf -->
        <g transform="translate(50, 56) scale(${pulseScale}) translate(-50, -56)">
          <path d="M 22 56 C 22 40, 36 34, 50 34 C 64 34, 78 40, 78 56 C 78 68, 68 72, 50 72 C 32 72, 22 68, 22 56 Z" fill="url(#bread)" stroke="#fef08a" stroke-width="2"/>
          <path d="M 36 46 Q 40 54 42 62 M 48 44 Q 52 54 54 64 M 60 46 Q 64 54 66 62" stroke="#78350f" stroke-width="3.5" stroke-linecap="round"/>
        </g>
      </svg>`;

      const encodedSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

      let link: HTMLLinkElement | null = document.querySelector("link[rel='icon']:not([rel='apple-touch-icon'])");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = encodedSvg;
    } catch (e) {}
  };

  intervalId = setInterval(updateFavicon, 200);

  return () => {
    if (intervalId) clearInterval(intervalId);
  };
}

