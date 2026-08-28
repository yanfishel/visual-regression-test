"use client";

import { useEffect, useRef, useState } from "react";
import { GlobeIcon } from "./icons";

// The site's favicon beside a project's base URL - the one the worker stored
// on the first run that found it (projects.favicon_key, served by
// /api/favicons). Until then, and whenever the stored file can't load, a
// globe placeholder of the same size stands in, so the URL never shifts.
// Decorative: the URL beside it is the label.
export function SiteFavicon({ faviconKey }: { faviconKey: string | null }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // The tag is server-rendered, so a fast failure can fire `error` before
  // React hydrates and attaches onError - that event is gone for good, and
  // the broken-image glyph would stay. A settled image with no pixels is the
  // same failure, so check on mount as well.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setFailed(true);
    }
  }, []);

  if (faviconKey === null || failed) {
    return <GlobeIcon className="h-4 w-4 shrink-0 text-text-faint" />;
  }

  return (
    <img
      ref={ref}
      src={`/api/favicons/${faviconKey}`}
      alt=""
      width={16}
      height={16}
      onError={() => setFailed(true)}
      className="h-4 w-4 shrink-0 rounded-sm object-contain"
    />
  );
}
