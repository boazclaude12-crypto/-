'use client';

import { Suspense, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const FB_PIXEL_ID = '1134680931381866';

// Component that uses useSearchParams must be wrapped in Suspense
const PixelContent = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  
  useEffect(() => {
    // Initialize Facebook Pixel
    import('react-facebook-pixel')
      .then((x) => x.default)
      .then((ReactPixel) => {
        ReactPixel.init(FB_PIXEL_ID);
        ReactPixel.pageView();
        console.log('Facebook Pixel initialized');
        
        // Track page views when route changes
        const handleRouteChange = () => {
          ReactPixel.pageView();
          console.log('PageView event tracked on:', pathname);
        };
        
        // Set up event listener for route changes
        window.addEventListener('routeChangeComplete', handleRouteChange);
        
        // Clean up event listener
        return () => {
          window.removeEventListener('routeChangeComplete', handleRouteChange);
        };
      })
      .catch((err) => console.error('Error initializing Facebook Pixel:', err));
  }, [pathname]);

  return children;
};

// Main component that provides the Suspense boundary
export default function ReactFacebookPixel({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PixelContent>{children}</PixelContent>
    </Suspense>
  );
}