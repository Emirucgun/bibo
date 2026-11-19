"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Kaydırınca beliren blok. JavaScript yoksa ya da blok zaten ekrandaysa hiç gizlenmez;
// yalnızca ekranın altında kalanlar gizlenip görününce belirir. Hareket azaltma tercihinde CSS kapatır.
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"shown" | "hidden">("shown");
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setState("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-reveal={state}
      className={className}
      style={delay && !settled ? { transitionDelay: `${delay}ms` } : undefined}
      onTransitionEnd={(event) => {
        // Beliriş bitince gecikme kalkar; yoksa içteki hover geçişleri de gecikir.
        if (event.target === event.currentTarget && state === "shown") setSettled(true);
      }}
    >
      {children}
    </Tag>
  );
}
