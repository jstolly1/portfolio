'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function ScrollLockOnLanding() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === '/') {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
    return () => document.body.classList.remove('no-scroll');
  }, [pathname]);
  return null;
}
