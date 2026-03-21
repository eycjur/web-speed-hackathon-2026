import { ReactNode, useEffect, useRef, useState } from "react";

interface Props {
  children: ReactNode;
  items: any[];
  fetchMore: () => void;
}

export const InfiniteScroll = ({ children, fetchMore, items }: Props) => {
  const latestItem = items[items.length - 1];
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    if (isEnabled) {
      return;
    }

    const enable = () => {
      setIsEnabled(true);
    };

    const timeoutId = window.setTimeout(enable, 1500);
    window.addEventListener("scroll", enable, { once: true, passive: true });

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("scroll", enable);
    };
  }, [isEnabled]);

  useEffect(() => {
    if (!isEnabled || latestItem === undefined) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (sentinel == null) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          fetchMore();
        }
      },
      {
        rootMargin: "200px 0px",
      },
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [isEnabled, latestItem, fetchMore]);

  return (
    <>
      {children}
      <div aria-hidden="true" ref={sentinelRef} />
    </>
  );
};
